package repository

import (
	"database/sql"
	"os"
	"testing"

	dbpkg "ccf-directory/db"
	_ "github.com/mattn/go-sqlite3"
)

func TestPersonalDataUpgradeAndMerge(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	schema, err := os.ReadFile("../../db/schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	exec := func(query string) {
		t.Helper()
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	count := func(query string, want int) {
		t.Helper()
		var n int
		if err := db.QueryRow(query).Scan(&n); err != nil || n != want {
			t.Fatalf("%s: got %d, want %d (%v)", query, n, want, err)
		}
	}
	exec(string(schema))
	exec(`INSERT INTO entries(type,ccf_domain,ccf_level,ccf_abbr,ccf_full) VALUES ('journal','','','','one'),('journal','','','','two');
		INSERT INTO users(username,password_hash) VALUES ('owner','hash');
		ALTER TABLE favorites ADD COLUMN user_id INTEGER;
		ALTER TABLE favorites ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
		INSERT INTO favorites(device_id,user_id,entry_id,tags) VALUES ('user:1',1,1,'["keep"]');
		INSERT INTO notes(device_id,user_id,entry_id,content) VALUES ('user:1',1,1,'owned')`)
	// Interrupt the migration after its first table rebuild and verify rollback.
	exec("CREATE TABLE notes_v1 (id INTEGER)")
	if err := dbpkg.Migrate(db, string(schema)); err == nil {
		t.Fatal("expected migration to roll back")
	}
	count("PRAGMA user_version", 0)
	count("SELECT count(*) FROM favorites WHERE id=1 AND user_id=1", 1)
	exec("DROP TABLE notes_v1")
	if err := dbpkg.Migrate(db, string(schema)); err != nil {
		t.Fatal(err)
	}
	if err := dbpkg.Migrate(db, "invalid if migration runs twice"); err != nil {
		t.Fatal(err)
	}
	count("PRAGMA user_version", 2)

	notes, tags := NewNoteRepo(db), NewTagRepo(db)
	if err := notes.Upsert("user:1", nil, 1, "guest"); err != nil {
		t.Fatal(err)
	}
	count("SELECT count(*) FROM notes WHERE user_id=1 AND content='owned'", 1)
	guestTags, err := tags.AggregateTagsFromFavorites("user:1")
	if err != nil || len(guestTags) != 0 {
		t.Fatalf("guest tags: %v, %v", guestTags, err)
	}

	exec(`INSERT INTO favorites(device_id,entry_id,tags) VALUES ('device',2,'["A_%"]');
		INSERT INTO notes(device_id,entry_id,content) VALUES ('device',2,'draft');
		CREATE TRIGGER fail_note BEFORE UPDATE ON notes BEGIN SELECT RAISE(ABORT,'test'); END`)
	users := NewUserRepo(db)
	if err := users.MergeDeviceData("device", 1); err == nil {
		t.Fatal("expected failure")
	}
	count("SELECT count(*) FROM favorites WHERE device_id='device' AND user_id IS NULL", 1)
	count("SELECT count(*) FROM user_tags", 0)
	exec("DROP TRIGGER fail_note")
	for i := 0; i < 2; i++ {
		if err := users.MergeDeviceData("device", 1); err != nil {
			t.Fatal(err)
		}
	}
	count("SELECT count(*) FROM notes WHERE user_id=1 AND content='draft'", 1)
	if err := tags.Delete(1, 1); err != ErrTagInUse {
		t.Fatalf("delete in-use tag: %v", err)
	}
	if _, err := tags.Update(1, 1, "renamed", "blue"); err != nil {
		t.Fatal(err)
	}
	count(`SELECT count(*) FROM favorites WHERE user_id=1 AND tags='["renamed"]'`, 1)
	count(`SELECT count(*) FROM favorites WHERE user_id=1 AND tags='["keep"]'`, 1)
	owner := 1
	if err := NewFavoriteRepo(db).UpdateTags("device", &owner, 2, []string{"A_%"}); err != ErrStaleTag {
		t.Fatalf("stale update: %v", err)
	}
	count(`SELECT count(*) FROM favorites WHERE user_id=1 AND tags='["renamed"]'`, 1)
	if err := notes.Upsert("device", &owner, 2, ""); err != nil {
		t.Fatal(err)
	}
	count("SELECT count(*) FROM notes WHERE user_id=1 AND entry_id=2", 0)
	exec(`INSERT INTO notes(device_id,user_id,entry_id,content) VALUES ('user:1',1,2,''),('device',NULL,2,'new draft')`)
	if err := users.MergeDeviceData("device", owner); err != nil {
		t.Fatal(err)
	}
	count("SELECT count(*) FROM notes WHERE user_id=1 AND entry_id=2 AND content='new draft'", 1)
	exec("DELETE FROM favorites WHERE entry_id=2")
	if err := tags.Delete(1, 1); err != nil {
		t.Fatal(err)
	}
}

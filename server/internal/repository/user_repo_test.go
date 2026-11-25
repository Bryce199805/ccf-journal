package repository

import (
	"database/sql"
	"os"
	"testing"

	dbpkg "ccf-directory/db"
	_ "github.com/mattn/go-sqlite3"
)

func TestRegistrationMergesAtomically(t *testing.T) {
	database, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	database.SetMaxOpenConns(1)
	schema, err := os.ReadFile("../../db/schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	if err := dbpkg.Migrate(database, string(schema)); err != nil {
		t.Fatal(err)
	}
	exec := func(s string) {
		t.Helper()
		if _, err := database.Exec(s); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO entries(type,ccf_domain,ccf_level,ccf_abbr,ccf_full) VALUES ('journal','AI','A','J','Journal');
		INSERT INTO favorites(device_id,entry_id,tags) VALUES ('device',1,'["Plan"]');
		INSERT INTO notes(device_id,entry_id,content) VALUES ('device',1,'draft');
		CREATE TRIGGER fail_merge BEFORE UPDATE ON notes BEGIN SELECT RAISE(ABORT,'test'); END`)
	users := NewUserRepo(database)
	if _, err := users.Create("reader", "hash", "device"); err == nil {
		t.Fatal("expected rollback")
	}
	if _, err := users.GetByUsername("reader"); err != sql.ErrNoRows {
		t.Fatalf("unexpected account: %v", err)
	}
	exec("DROP TRIGGER fail_merge")
	user, err := users.Create("reader", "hash", "device")
	if err != nil {
		t.Fatal(err)
	}
	var count int
	if err := database.QueryRow(`SELECT count(*) FROM favorites f JOIN notes n USING(user_id,entry_id)
		JOIN user_tags t ON t.user_id=f.user_id WHERE f.user_id=? AND n.content='draft' AND t.name='Plan'`, user.ID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("migration incomplete: %d %v", count, err)
	}
	if _, err := users.Create("reader", "hash", ""); err != ErrUsernameTaken {
		t.Fatalf("duplicate: %v", err)
	}
	fav := NewFavoriteRepo(database)
	if err := fav.UpdateTags("device", nil, 1, []string{"Plan"}); err != sql.ErrNoRows {
		t.Fatalf("updated missing guest favorite: %v", err)
	}
	if err := fav.UpdateTags("", &user.ID, 1, []string{"Plan"}); err != nil {
		t.Fatal(err)
	}
}

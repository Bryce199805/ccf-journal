package repository

import (
	"database/sql"
	"os"
	"testing"

	"ccf-directory/internal/model"
	_ "github.com/mattn/go-sqlite3"
)

func TestDomainAndLevelMustMatchSameRelation(t *testing.T) {
	database, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	schema, err := os.ReadFile("../../db/schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(string(schema)); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`INSERT INTO entries(type, ccf_domain, ccf_level, ccf_abbr, ccf_full, ccf_relations)
		VALUES ('journal', 'Networks', 'A', 'MULTI', 'Multiple Domains', '[{"domain":"Networks","level":"A"},{"domain":"Security","level":"B"}]')`); err != nil {
		t.Fatal(err)
	}
	repo := NewEntryRepo(database)
	for _, testcase := range []struct {
		domain, level string
		count         int64
	}{
		{"Security", "B", 1}, {"Security", "A", 0}, {"Networks", "A", 1},
		{"Security", "", 1}, {"", "B", 1}, {"Networks,Security", "B", 1},
	} {
		items, count, err := repo.List(&model.ListQuery{Domain: testcase.domain, Level: testcase.level, Page: 1, PerPage: 10})
		if err != nil {
			t.Fatal(err)
		}
		if count != testcase.count {
			t.Fatalf("domain=%s level=%s: got %d want %d", testcase.domain, testcase.level, count, testcase.count)
		}
		if count > 0 && (len(items) != 1 || items[0].CCFRelations == nil) {
			t.Fatal("list lost multi-domain relations")
		}
	}
	if _, err := database.Exec(`INSERT INTO entries(type,ccf_domain,ccf_level,ccf_abbr,ccf_full,is_ccf,catalog_source)
		VALUES ('journal','','','','Archived',0,'historical_ccf'), ('journal','','','','Non-CCF',0,'cas-computer-science-1-2')`); err != nil {
		t.Fatal(err)
	}
	items, count, err := repo.List(&model.ListQuery{Catalog: "non_ccf", Page: 1, PerPage: 10})
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 || items[0].CatalogSource == "historical_ccf" {
		t.Fatal("historical CCF entries were mixed into the curated Non-CCF catalog")
	}
	_, count, err = repo.List(&model.ListQuery{Page: 1, PerPage: 10})
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("normal browsing included archived rows: %d", count)
	}
	stats, err := repo.GetStats()
	if err != nil {
		t.Fatal(err)
	}
	if stats.TotalJournals != 2 || stats.NonCCFJournals != 1 {
		t.Fatal("catalog totals included archived rows")
	}
}

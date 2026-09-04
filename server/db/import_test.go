package db

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestImportSupportsLegacyAndCurrentJournalData(t *testing.T) {
	database, err := sql.Open("sqlite3", filepath.Join(t.TempDir(), "test.db")+"?_foreign_keys=1")
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	schema, err := os.ReadFile("schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(string(schema)); err != nil {
		t.Fatal(err)
	}

	input := filepath.Join(t.TempDir(), "import.json")
	payload := `{
      "journals": [
        {"ccfDomain":"AI","ccfLevel":"A","ccfAbbr":"OLD","ccfFull":"Old Journal","impactFactor":"1.2"},
        {"ccfDomain":"AI","ccfLevel":"B","ccfAbbr":"NEW","ccfFull":"New Journal","journalid":"101","name":"NEW JOURNAL","journalAbbr":"NEW J","fetchedAt":"2026-09-03T00:00:00Z","wosZone":"","wosStatus":"not_indexed","wosReason":"not_in_latest_jcr","ccfRelations":[{"domain":"AI","level":"B","abbr":"NEW","full":"New Journal"}]}
      ],
      "conferences": [
        {"domain":"AI","level":"A","abbr":"CONF","full":"Conference","publisher":"ACM","url":"https://example.invalid/conf"}
      ]
    }`
	if err := os.WriteFile(input, []byte(payload), 0600); err != nil {
		t.Fatal(err)
	}
	if err := ImportFromJSON(database, input); err != nil {
		t.Fatal(err)
	}

	var status, reason, scrapedAt, relations string
	if err := database.QueryRow(
		"SELECT wos_status, wos_reason, last_scraped_at, ccf_relations FROM entries WHERE journalid = '101'",
	).Scan(&status, &reason, &scrapedAt, &relations); err != nil {
		t.Fatal(err)
	}
	if status != "not_indexed" || reason != "not_in_latest_jcr" {
		t.Fatalf("unexpected WOS state: %q %q", status, reason)
	}
	if scrapedAt != "2026-09-03T00:00:00Z" {
		t.Fatalf("fetchedAt compatibility failed: %q", scrapedAt)
	}
	if relations == "" || relations == "null" {
		t.Fatal("CCF relations were not preserved")
	}
	var journalAbbr string
	if err := database.QueryRow("SELECT journal_abbr FROM entries WHERE journalid = '101'").Scan(&journalAbbr); err != nil {
		t.Fatal(err)
	}
	if journalAbbr != "NEW J" {
		t.Fatalf("journal abbreviation was not preserved: %q", journalAbbr)
	}

	var entryType string
	var isCCF int
	var source, inclusion string
	if err := database.QueryRow(
		"SELECT type, is_ccf, catalog_source, inclusion_reason FROM entries WHERE ccf_abbr = 'CONF'",
	).Scan(&entryType, &isCCF, &source, &inclusion); err != nil {
		t.Fatal(err)
	}
	if entryType != "conference" || isCCF != 1 || source != "ccf" || inclusion != "CCF推荐目录" {
		t.Fatalf("conference compatibility failed: %q %d %q %q", entryType, isCCF, source, inclusion)
	}
}

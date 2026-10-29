package db

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestRetiredProviderIdentityCannotReplaceItsSuccessorOrPersonalReferences(t *testing.T) {
	database, err := sql.Open("sqlite3", filepath.Join(t.TempDir(), "retirement.db")+"?_foreign_keys=1")
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
	write := func(data ImportData) error {
		t.Helper()
		payload, err := json.Marshal(data)
		if err != nil {
			return err
		}
		if err := os.WriteFile(input, payload, 0600); err != nil {
			return err
		}
		return ImportFromJSON(database, input)
	}
	if err := write(ImportData{Journals: []JournalImport{{
		CCFFull: "Current Journal", Name: "Previous Journal", JournalID: "old",
		ISSN: "1532-060X", ImpactFactor: "9", CCFLevel: "C",
	}}}); err != nil {
		t.Fatal(err)
	}
	var oldID int
	if err := database.QueryRow("SELECT id FROM entries WHERE journalid = 'old'").Scan(&oldID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec("INSERT INTO favorites(device_id, entry_id) VALUES ('device', ?)", oldID); err != nil {
		t.Fatal(err)
	}
	retirement := JournalIdentityRetirement{
		JournalID: "old", ISSN: "1532-060X", ExpectedName: "Previous Journal",
		LegacyFull: "Previous Journal", SuccessorFull: "Current Journal", SuccessorISSN: "2047-7473",
		Reason: "Predecessor retained separately from the current serial",
	}
	packet := ImportData{JournalCatalogComplete: true,
		RetiredJournalIdentities: []JournalIdentityRetirement{retirement},
		Journals: []JournalImport{{CCFFull: "Current Journal", Name: "Current Journal", JournalID: "new",
			ISSN: "2047-7473", EISSN: "2047-7481", ImpactFactor: "2", CCFLevel: "C"}},
	}
	for i := 0; i < 2; i++ {
		if err := write(packet); err != nil {
			t.Fatal(err)
		}
	}
	var keptID, currentID, count int
	var legacyTitle, legacySource string
	var oldIF, currentIF float64
	if err := database.QueryRow(`SELECT entries.id, ccf_full, catalog_source, impact_factor
		FROM favorites JOIN entries ON entries.id = entry_id WHERE device_id = 'device'`).
		Scan(&keptID, &legacyTitle, &legacySource, &oldIF); err != nil {
		t.Fatal(err)
	}
	if keptID != oldID || legacyTitle != "Previous Journal" || legacySource != "historical_ccf" || oldIF != 9 {
		t.Fatal("retirement changed the predecessor or its personal references")
	}
	if err := database.QueryRow("SELECT id, impact_factor FROM entries WHERE journalid = 'new' AND is_ccf = 1").Scan(&currentID, &currentIF); err != nil {
		t.Fatal(err)
	}
	if currentID == oldID || currentIF != 2 {
		t.Fatal("current serial reused predecessor identity or metrics")
	}
	if err := database.QueryRow("SELECT count(*) FROM entries").Scan(&count); err != nil || count != 2 {
		t.Fatalf("retirement import was not idempotent: %d, %v", count, err)
	}
	packet.Journals[0].ISSN = "different-serial"
	packet.Journals[0].ImpactFactor = "999"
	if err := write(packet); err == nil {
		t.Fatal("retirement accepted a replacement without the verified current serial")
	}
	if err := database.QueryRow("SELECT impact_factor FROM entries WHERE id = ?", currentID).Scan(&currentIF); err != nil || currentIF != 2 {
		t.Fatal("failed retirement import changed the current journal")
	}
}

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

func TestCompleteCatalogPreservesEntryIDsAndRetiresRemovedMembership(t *testing.T) {
	database, err := sql.Open("sqlite3", ":memory:")
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
	write := func(data ImportData) {
		t.Helper()
		payload, err := json.Marshal(data)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(input, payload, 0600); err != nil {
			t.Fatal(err)
		}
		if err := ImportFromJSON(database, input); err != nil {
			t.Fatal(err)
		}
	}
	write(ImportData{Journals: []JournalImport{
		{CCFAbbr: "KEEP", CCFFull: "Kept Journal", CCFLevel: "C"},
		{CCFAbbr: "DROP", CCFFull: "Removed Journal", CCFLevel: "A"},
	}})
	if _, err := database.Exec(`INSERT INTO favorites(device_id, entry_id) SELECT 'device', id FROM entries`); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		write(ImportData{JournalCatalogComplete: true, Journals: []JournalImport{
			{CCFAbbr: "KEEP", CCFFull: "Kept Journal", CCFLevel: "B"},
			{CCFFull: "Journal Without Abbreviation", CCFLevel: "C"},
			{CCFAbbr: "CC", CCFFull: "Computer Communications", CCFLevel: "C"},
			{CCFAbbr: "CC", CCFFull: "Computational Complexity", CCFLevel: "B"},
		}})
	}
	var count int
	if err := database.QueryRow(`SELECT count(*) FROM entries`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 5 {
		t.Fatalf("repeated import created duplicates: %d", count)
	}
	if err := database.QueryRow(`SELECT count(*) FROM favorites JOIN entries ON entry_id = entries.id WHERE (ccf_abbr = 'KEEP' AND ccf_level = 'B' AND is_ccf = 1) OR (ccf_abbr = 'DROP' AND is_ccf = 0)`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatal("favorite IDs or current membership were not preserved")
	}

	// A newly inserted placeholder can coexist with an old, renamed record until
	// its provider identity is resolved. Only the updated canonical ID is current.
	if _, err := database.Exec(`INSERT INTO entries(type,ccf_domain,ccf_level,ccf_abbr,ccf_full,journalid)
		VALUES ('journal','Old','A','OLD','Old Name','999')`); err != nil {
		t.Fatal(err)
	}
	write(ImportData{JournalCatalogComplete: true, Journals: []JournalImport{
		{CCFFull: "Journal Without Abbreviation", CCFLevel: "C", JournalID: "999"},
	}})
	if err := database.QueryRow(`SELECT count(*) FROM entries WHERE type='journal' AND is_ccf=1`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("resolved placeholder left duplicate CCF memberships: %d", count)
	}
	var identity string
	if err := database.QueryRow(`SELECT journalid FROM entries WHERE is_ccf=1 AND type='journal'`).Scan(&identity); err != nil {
		t.Fatal(err)
	}
	if identity != "999" {
		t.Fatal("resolved journal did not preserve its provider identity")
	}
}

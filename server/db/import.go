package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
)

// ImportData represents the data to import
type ImportData struct {
	JournalCatalog           json.RawMessage             `json:"journalCatalog"`
	JournalCatalogComplete   bool                        `json:"journalCatalogComplete"`
	Journals                 []JournalImport             `json:"journals"`
	Conferences              []ConferenceImport          `json:"conferences"`
	RetiredJournalIdentities []JournalIdentityRetirement `json:"retiredJournalIdentities"`
}

// A verified predecessor must be detached before title-based lookup of its successor.
// This updates catalog metadata only; entry IDs, metrics and personal references stay intact.
type JournalIdentityRetirement struct {
	JournalID     string `json:"journalid"`
	ISSN          string `json:"issn"`
	ExpectedName  string `json:"expectedName"`
	LegacyFull    string `json:"legacyFull"`
	SuccessorFull string `json:"successorFull"`
	SuccessorISSN string `json:"successorIssn"`
	Reason        string `json:"reason"`
}

func retireJournalIdentities(tx *sql.Tx, data ImportData) error {
	if len(data.RetiredJournalIdentities) > 0 && !data.JournalCatalogComplete {
		return fmt.Errorf("journal identity retirement requires a complete catalog")
	}
	for _, retired := range data.RetiredJournalIdentities {
		if retired.JournalID == "" || retired.ISSN == "" || retired.ExpectedName == "" ||
			retired.LegacyFull == "" || retired.SuccessorFull == "" || retired.SuccessorISSN == "" {
			return fmt.Errorf("incomplete journal identity retirement")
		}
		replacementExists := false
		for _, journal := range data.Journals {
			if journal.CCFFull == retired.SuccessorFull && journal.JournalID != retired.JournalID &&
				(journal.IsCCF == nil || *journal.IsCCF) &&
				(journal.ISSN == retired.SuccessorISSN || journal.EISSN == retired.SuccessorISSN) {
				replacementExists = true
				break
			}
		}
		if !replacementExists {
			return fmt.Errorf("missing verified successor identity for %s", retired.LegacyFull)
		}
		result, err := tx.Exec(`UPDATE entries SET is_ccf = 0, ccf_relations = NULL,
			catalog_source = 'historical_ccf', inclusion_reason = ?, ccf_full = ?,
			updated_at = CURRENT_TIMESTAMP
			WHERE type = 'journal' AND journalid = ? AND issn = ? AND name = ?`,
			retired.Reason, retired.LegacyFull, retired.JournalID, retired.ISSN, retired.ExpectedName)
		if err != nil {
			return err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if count == 0 {
			var unresolved int
			if err := tx.QueryRow(`SELECT count(*) FROM entries WHERE type = 'journal'
				AND journalid = ? AND ccf_full = ?`, retired.JournalID, retired.SuccessorFull).Scan(&unresolved); err != nil {
				return err
			}
			if unresolved > 0 {
				return fmt.Errorf("predecessor snapshot does not match retirement for %s", retired.SuccessorFull)
			}
		}
	}
	return nil
}

type JournalImport struct {
	CCFDomain         string      `json:"ccfDomain"`
	CCFLevel          string      `json:"ccfLevel"`
	CCFAbbr           string      `json:"ccfAbbr"`
	CCFFull           string      `json:"ccfFull"`
	CCFPublisher      string      `json:"ccfPublisher"`
	CCFUrl            string      `json:"ccfUrl"`
	CCFRelations      interface{} `json:"ccfRelations"`
	LetPubUrl         string      `json:"letpubUrl"`
	JournalID         string      `json:"journalid"`
	Name              string      `json:"name"`
	JournalAbbr       string      `json:"journalAbbr"`
	ISSN              string      `json:"issn"`
	EISSN             string      `json:"eissn"`
	Publisher         string      `json:"publisher"`
	Country           string      `json:"country"`
	Language          string      `json:"language"`
	Periodicity       string      `json:"periodicity"`
	ResearchArea      string      `json:"researchArea"`
	IsOA              string      `json:"isOA"`
	GoldOARatio       string      `json:"goldOARatio"`
	OfficialUrl       string      `json:"officialUrl"`
	SubmissionUrl     string      `json:"submissionUrl"`
	SCIType           string      `json:"sciType"`
	ImpactFactor      interface{} `json:"impactFactor"`
	RealtimeIF        interface{} `json:"realtimeIF"`
	FiveYearIF        interface{} `json:"fiveYearIF"`
	JCIValue          interface{} `json:"jciValue"`
	HIndex            interface{} `json:"hIndex"`
	CiteScore         interface{} `json:"citeScore"`
	SJR               interface{} `json:"sjr"`
	SNIP              interface{} `json:"snip"`
	SelfCitationRate  string      `json:"selfCitationRate"`
	ReviewSpeed       string      `json:"reviewSpeed"`
	AcceptanceRate    string      `json:"acceptanceRate"`
	ArticleCount      interface{} `json:"articleCount"`
	LetPubScore       interface{} `json:"letpubScore"`
	Xinrui            interface{} `json:"xinrui"`
	CAS2025           interface{} `json:"cas2025"`
	CAS2023           interface{} `json:"cas2023"`
	WoSZone           string      `json:"wosZone"`
	WoSStatus         string      `json:"wosStatus"`
	WoSReason         string      `json:"wosReason"`
	JIF               interface{} `json:"jif"`
	JCI               interface{} `json:"jci"`
	CiteScoreRankings interface{} `json:"citeScoreRankings"`
	IsCCF             *bool       `json:"isCCF"`
	CatalogSource     string      `json:"catalogSource"`
	InclusionReason   string      `json:"inclusionReason"`
	LastScrapedAt     string      `json:"lastScrapedAt"`
	FetchedAt         string      `json:"fetchedAt"`
}

type ConferenceImport struct {
	Domain    string `json:"domain"`
	Level     string `json:"level"`
	Abbr      string `json:"abbr"`
	Full      string `json:"full"`
	Publisher string `json:"publisher"`
	Url       string `json:"url"`
}

func toFloat64(v interface{}) *float64 {
	if v == nil || v == "" || v == "-" {
		return nil
	}
	switch val := v.(type) {
	case float64:
		return &val
	case string:
		var f float64
		if _, err := fmt.Sscanf(val, "%f", &f); err == nil {
			return &f
		}
	}
	return nil
}

func toInt(v interface{}) *int {
	if v == nil || v == "" || v == "-" {
		return nil
	}
	switch val := v.(type) {
	case float64:
		i := int(val)
		return &i
	case string:
		var i int
		if _, err := fmt.Sscanf(val, "%d", &i); err == nil {
			return &i
		}
	}
	return nil
}

func toJSON(v interface{}) *string {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	s := string(b)
	if s == "null" || s == `""` {
		return nil
	}
	return &s
}

func strPtr(s string) *string {
	if s == "" || s == "-" {
		return nil
	}
	return &s
}

var entryImportColumns = []string{
	"type", "ccf_domain", "ccf_level", "ccf_abbr", "ccf_full", "ccf_publisher", "ccf_url", "ccf_relations",
	"letpub_url", "journalid", "name", "journal_abbr", "issn", "eissn", "publisher", "country", "language",
	"periodicity", "research_area", "is_oa", "gold_oa_ratio", "official_url", "submission_url", "sci_type",
	"impact_factor", "realtime_if", "five_year_if", "jci_value", "h_index", "cite_score", "sjr", "snip",
	"self_citation_rate", "review_speed", "acceptance_rate", "article_count", "letpub_score",
	"xinrui", "cas2025", "cas2023", "wos_zone", "wos_status", "wos_reason", "jif", "jci_json", "citescore_rankings",
	"is_ccf", "catalog_source", "inclusion_reason", "last_scraped_at", "last_scrape_error",
}

func journalImportArgs(j JournalImport) []interface{} {
	isCCF := true
	if j.IsCCF != nil {
		isCCF = *j.IsCCF
	}
	catalogSource := j.CatalogSource
	if catalogSource == "" {
		catalogSource = "ccf"
	}
	inclusionReason := j.InclusionReason
	if inclusionReason == "" {
		inclusionReason = "CCF推荐目录"
	}
	lastScrapedAt := j.LastScrapedAt
	if lastScrapedAt == "" {
		lastScrapedAt = j.FetchedAt
	}
	return []interface{}{
		"journal", j.CCFDomain, j.CCFLevel, j.CCFAbbr, j.CCFFull, j.CCFPublisher, j.CCFUrl,
		toJSON(j.CCFRelations), strPtr(j.LetPubUrl), strPtr(j.JournalID), strPtr(j.Name), strPtr(j.JournalAbbr), strPtr(j.ISSN), strPtr(j.EISSN),
		strPtr(j.Publisher), strPtr(j.Country), strPtr(j.Language), strPtr(j.Periodicity),
		strPtr(j.ResearchArea), strPtr(j.IsOA), strPtr(j.GoldOARatio), strPtr(j.OfficialUrl),
		strPtr(j.SubmissionUrl), strPtr(j.SCIType), toFloat64(j.ImpactFactor), toFloat64(j.RealtimeIF),
		toFloat64(j.FiveYearIF), toFloat64(j.JCIValue), toInt(j.HIndex), toFloat64(j.CiteScore),
		toFloat64(j.SJR), toFloat64(j.SNIP), strPtr(j.SelfCitationRate), strPtr(j.ReviewSpeed),
		strPtr(j.AcceptanceRate), toInt(j.ArticleCount), toFloat64(j.LetPubScore), toJSON(j.Xinrui),
		toJSON(j.CAS2025), toJSON(j.CAS2023), strPtr(j.WoSZone), strPtr(j.WoSStatus), strPtr(j.WoSReason),
		toJSON(j.JIF), toJSON(j.JCI), toJSON(j.CiteScoreRankings), isCCF, catalogSource, inclusionReason,
		strPtr(lastScrapedAt), nil,
	}
}

func conferenceImportArgs(c ConferenceImport) []interface{} {
	args := make([]interface{}, len(entryImportColumns))
	args[0], args[1], args[2], args[3] = "conference", c.Domain, c.Level, c.Abbr
	args[4], args[5], args[6] = c.Full, c.Publisher, c.Url
	args[46], args[47], args[48] = true, "ccf", "CCF推荐目录"
	return args
}

func findExistingJournalID(tx *sql.Tx, j JournalImport) (int, error) {
	lookups := []struct {
		column string
		value  string
	}{
		{"journalid", j.JournalID},
		{"issn", j.ISSN},
		{"eissn", j.EISSN},
		{"ccf_full", j.CCFFull},
		{"ccf_abbr", j.CCFAbbr},
	}
	for _, lookup := range lookups {
		// Acronyms are not unique across the complete catalog (for example CC/CL).
		if lookup.column == "ccf_abbr" && j.CCFFull != "" {
			continue
		}
		if lookup.value == "" || lookup.value == "-" {
			continue
		}
		var id int
		err := tx.QueryRow("SELECT id FROM entries WHERE type = 'journal' AND "+lookup.column+" = ? LIMIT 1", lookup.value).Scan(&id)
		if err == nil {
			return id, nil
		}
		if err != sql.ErrNoRows {
			return 0, err
		}
	}
	return 0, nil
}

// ImportFromJSON incrementally inserts or updates catalog data while preserving entry IDs.
func ImportFromJSON(db *sql.DB, path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("failed to read import file: %w", err)
	}

	var importData ImportData
	if err := json.Unmarshal(data, &importData); err != nil {
		return fmt.Errorf("failed to parse import file: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := retireJournalIdentities(tx, importData); err != nil {
		return err
	}
	if importData.JournalCatalogComplete {
		if len(importData.Journals) == 0 {
			return fmt.Errorf("empty complete journal catalog")
		}
		if _, err := tx.Exec("CREATE TEMP TABLE IF NOT EXISTS ccf_import_seen (id INTEGER PRIMARY KEY)"); err != nil {
			return err
		}
		if _, err := tx.Exec("DELETE FROM temp.ccf_import_seen"); err != nil {
			return err
		}
	}

	insertColumns := entryImportColumns
	insertPlaceholders := strings.TrimSuffix(strings.Repeat("?,", len(insertColumns)), ",")
	insertSQL := "INSERT INTO entries (" + strings.Join(insertColumns, ",") + ") VALUES (" + insertPlaceholders + ")"
	insertStmt, err := tx.Prepare(insertSQL)
	if err != nil {
		return err
	}
	defer insertStmt.Close()

	assignments := make([]string, 0, len(entryImportColumns)-1)
	for _, column := range entryImportColumns[1:] {
		assignments = append(assignments, column+" = ?")
	}
	updateSQL := "UPDATE entries SET " + strings.Join(assignments, ",") + ", updated_at = CURRENT_TIMESTAMP WHERE id = ?"
	updateStmt, err := tx.Prepare(updateSQL)
	if err != nil {
		return err
	}
	defer updateStmt.Close()

	var importErrors []string
	inserted, updated := 0, 0
	for _, j := range importData.Journals {
		id, lookupErr := findExistingJournalID(tx, j)
		if lookupErr != nil {
			importErrors = append(importErrors, fmt.Sprintf("journal %s lookup: %v", j.CCFAbbr, lookupErr))
			continue
		}
		args := journalImportArgs(j)
		var execErr error
		if id == 0 {
			var result sql.Result
			result, execErr = insertStmt.Exec(args...)
			if execErr == nil {
				insertID, idErr := result.LastInsertId()
				if idErr != nil {
					return idErr
				}
				id = int(insertID)
				inserted++
			}
		} else {
			updateArgs := append(args[1:], id)
			_, execErr = updateStmt.Exec(updateArgs...)
			if execErr == nil {
				updated++
			}
		}
		if execErr != nil {
			importErrors = append(importErrors, fmt.Sprintf("journal %s: %v", j.CCFAbbr, execErr))
		} else if importData.JournalCatalogComplete && (j.IsCCF == nil || *j.IsCCF) {
			if _, err := tx.Exec("INSERT OR IGNORE INTO temp.ccf_import_seen(id) VALUES (?)", id); err != nil {
				return err
			}
		}
	}

	for _, c := range importData.Conferences {
		var id int
		lookupErr := tx.QueryRow("SELECT id FROM entries WHERE type = 'conference' AND ccf_abbr = ? LIMIT 1", c.Abbr).Scan(&id)
		args := conferenceImportArgs(c)
		var execErr error
		if lookupErr == sql.ErrNoRows {
			_, execErr = insertStmt.Exec(args...)
			if execErr == nil {
				inserted++
			}
		} else if lookupErr != nil {
			execErr = lookupErr
		} else {
			updateArgs := append(args[1:], id)
			_, execErr = updateStmt.Exec(updateArgs...)
			if execErr == nil {
				updated++
			}
		}
		if execErr != nil {
			importErrors = append(importErrors, fmt.Sprintf("conference %s: %v", c.Abbr, execErr))
		}
	}

	// Preserve IDs, favorites and notes for titles removed from a complete snapshot.
	if importData.JournalCatalogComplete {
		_, err = tx.Exec(`UPDATE entries SET is_ccf = 0, ccf_relations = NULL,
			catalog_source = 'historical_ccf', inclusion_reason = '未列入当前CCF期刊目录'
			WHERE type = 'journal' AND is_ccf = 1 AND id NOT IN (SELECT id FROM temp.ccf_import_seen)`)
		if err != nil {
			return err
		}
		if _, err := tx.Exec("DROP TABLE temp.ccf_import_seen"); err != nil {
			return err
		}
	}

	if len(importErrors) > 0 {
		log.Printf("Import had %d errors:", len(importErrors))
		for _, e := range importErrors {
			log.Printf("  %s", e)
		}
		return fmt.Errorf("catalog sync aborted with %d errors", len(importErrors))
	}

	if len(importData.JournalCatalog) > 0 {
		if _, err := tx.Exec("INSERT INTO catalog_metadata(key, value) VALUES ('journal_catalog', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", string(importData.JournalCatalog)); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}

	log.Printf("Catalog sync complete: %d inserted, %d updated", inserted, updated)
	return nil
}

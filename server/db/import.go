package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
)

// ImportData represents the data to import
type ImportData struct {
	Journals    []JournalImport    `json:"journals"`
	Conferences []ConferenceImport `json:"conferences"`
}

type JournalImport struct {
	CCFDomain       string      `json:"ccfDomain"`
	CCFLevel        string      `json:"ccfLevel"`
	CCFAbbr         string      `json:"ccfAbbr"`
	CCFFull         string      `json:"ccfFull"`
	CCFPublisher    string      `json:"ccfPublisher"`
	CCFUrl          string      `json:"ccfUrl"`
	LetPubUrl       string      `json:"letpubUrl"`
	JournalID       string      `json:"journalid"`
	Name            string      `json:"name"`
	ISSN            string      `json:"issn"`
	EISSN           string      `json:"eissn"`
	Publisher       string      `json:"publisher"`
	Country         string      `json:"country"`
	Language        string      `json:"language"`
	Periodicity     string      `json:"periodicity"`
	ResearchArea    string      `json:"researchArea"`
	IsOA            string      `json:"isOA"`
	GoldOARatio     string      `json:"goldOARatio"`
	OfficialUrl     string      `json:"officialUrl"`
	SubmissionUrl   string      `json:"submissionUrl"`
	SCIType         string      `json:"sciType"`
	ImpactFactor    interface{} `json:"impactFactor"`
	RealtimeIF      interface{} `json:"realtimeIF"`
	FiveYearIF      interface{} `json:"fiveYearIF"`
	JCIValue        interface{} `json:"jciValue"`
	HIndex          interface{} `json:"hIndex"`
	CiteScore       interface{} `json:"citeScore"`
	SJR             interface{} `json:"sjr"`
	SNIP            interface{} `json:"snip"`
	SelfCitationRate string     `json:"selfCitationRate"`
	ReviewSpeed     string      `json:"reviewSpeed"`
	AcceptanceRate  string      `json:"acceptanceRate"`
	ArticleCount    interface{} `json:"articleCount"`
	LetPubScore     interface{} `json:"letpubScore"`
	Xinrui          interface{} `json:"xinrui"`
	CAS2025         interface{} `json:"cas2025"`
	CAS2023         interface{} `json:"cas2023"`
	WoSZone         string      `json:"wosZone"`
	JIF             interface{} `json:"jif"`
	JCI             interface{} `json:"jci"`
	CiteScoreRankings interface{} `json:"citeScoreRankings"`
}

type ConferenceImport struct {
	Domain     string `json:"domain"`
	Level      string `json:"level"`
	Abbr       string `json:"abbr"`
	Full       string `json:"full"`
	Publisher  string `json:"publisher"`
	Url        string `json:"url"`
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

// ImportFromJSON imports data from a JSON file into the database
func ImportFromJSON(db *sql.DB, path string) error {
	// Check if data already exists
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM entries").Scan(&count); err != nil {
		return fmt.Errorf("failed to check existing entries: %w", err)
	}
	if count > 0 {
		log.Printf("Database already has %d entries, skipping import", count)
		return nil
	}

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

	stmt, err := tx.Prepare(`INSERT INTO entries (
		type, ccf_domain, ccf_level, ccf_abbr, ccf_full, ccf_publisher, ccf_url,
		letpub_url, journalid, name, issn, eissn, publisher, country, language,
		periodicity, research_area, is_oa, gold_oa_ratio,
		official_url, submission_url, sci_type,
		impact_factor, realtime_if, five_year_if, jci_value,
		h_index, cite_score, sjr, snip,
		self_citation_rate, review_speed, acceptance_rate,
		article_count, letpub_score,
		xinrui, cas2025, cas2023, wos_zone,
		jif, jci_json, citescore_rankings
	) VALUES (
		?, ?, ?, ?, ?, ?, ?,
		?, ?, ?, ?, ?, ?, ?, ?,
		?, ?, ?, ?,
		?, ?, ?,
		?, ?, ?, ?,
		?, ?, ?, ?,
		?, ?, ?,
		?, ?,
		?, ?, ?, ?,
		?, ?, ?
	)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	// Import journals
	var importErrors []string
	for _, j := range importData.Journals {
		_, err := stmt.Exec(
			"journal", j.CCFDomain, j.CCFLevel, j.CCFAbbr, j.CCFFull, j.CCFPublisher, j.CCFUrl,
			strPtr(j.LetPubUrl), strPtr(j.JournalID), strPtr(j.Name), strPtr(j.ISSN), strPtr(j.EISSN),
			strPtr(j.Publisher), strPtr(j.Country), strPtr(j.Language),
			strPtr(j.Periodicity), strPtr(j.ResearchArea), strPtr(j.IsOA), strPtr(j.GoldOARatio),
			strPtr(j.OfficialUrl), strPtr(j.SubmissionUrl), strPtr(j.SCIType),
			toFloat64(j.ImpactFactor), toFloat64(j.RealtimeIF), toFloat64(j.FiveYearIF), toFloat64(j.JCIValue),
			toInt(j.HIndex), toFloat64(j.CiteScore), toFloat64(j.SJR), toFloat64(j.SNIP),
			strPtr(j.SelfCitationRate), strPtr(j.ReviewSpeed), strPtr(j.AcceptanceRate),
			toInt(j.ArticleCount), toFloat64(j.LetPubScore),
			toJSON(j.Xinrui), toJSON(j.CAS2025), toJSON(j.CAS2023), strPtr(j.WoSZone),
			toJSON(j.JIF), toJSON(j.JCI), toJSON(j.CiteScoreRankings),
		)
		if err != nil {
			importErrors = append(importErrors, fmt.Sprintf("journal %s: %v", j.CCFAbbr, err))
		}
	}

	// Import conferences
	for _, c := range importData.Conferences {
		_, err := stmt.Exec(
			"conference", c.Domain, c.Level, c.Abbr, c.Full, c.Publisher, c.Url,
			nil, nil, nil, nil, nil, nil, nil, nil,
			nil, nil, nil, nil,
			nil, nil, nil,
			nil, nil, nil, nil,
			nil, nil, nil, nil,
			nil, nil, nil,
			nil, nil,
			nil, nil, nil, nil,
			nil, nil, nil,
		)
		if err != nil {
			importErrors = append(importErrors, fmt.Sprintf("conference %s: %v", c.Abbr, err))
		}
	}

	if len(importErrors) > 0 {
		log.Printf("Import had %d errors:", len(importErrors))
		for _, e := range importErrors {
			log.Printf("  %s", e)
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	log.Printf("Imported %d journals and %d conferences", len(importData.Journals), len(importData.Conferences))
	return nil
}

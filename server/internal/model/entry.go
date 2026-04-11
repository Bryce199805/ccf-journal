package model

import (
	"database/sql"
	"strings"
)

// Entry represents a journal or conference entry
type Entry struct {
	ID              int     `json:"id"`
	Type            string  `json:"type"`              // journal / conference
	CCFDomain       string  `json:"ccf_domain"`
	CCFLevel        string  `json:"ccf_level"`
	CCFAbbr         string  `json:"ccf_abbr"`
	CCFFull         string  `json:"ccf_full"`
	CCFPublisher    string  `json:"ccf_publisher"`
	CCFUrl          string  `json:"ccf_url"`
	LetPubUrl       *string `json:"letpub_url"`
	JournalID       *string `json:"journalid"`
	Name            *string `json:"name"`
	ISSN            *string `json:"issn"`
	EISSN           *string `json:"eissn"`
	Publisher       *string `json:"publisher"`
	Country         *string `json:"country"`
	Language        *string `json:"language"`
	Periodicity     *string `json:"periodicity"`
	ResearchArea    *string `json:"research_area"`
	IsOA            *string `json:"is_oa"`
	GoldOARatio     *string `json:"gold_oa_ratio"`
	OfficialUrl     *string `json:"official_url"`
	SubmissionUrl   *string `json:"submission_url"`
	SCIType         *string `json:"sci_type"`
	ImpactFactor    *float64 `json:"impact_factor"`
	RealtimeIF      *float64 `json:"realtime_if"`
	FiveYearIF      *float64 `json:"five_year_if"`
	JCIValue        *float64 `json:"jci_value"`
	HIndex          *int    `json:"h_index"`
	CiteScore       *float64 `json:"cite_score"`
	SJR             *float64 `json:"sjr"`
	SNIP            *float64 `json:"snip"`
	SelfCitationRate *string `json:"self_citation_rate"`
	ReviewSpeed     *string `json:"review_speed"`
	AcceptanceRate  *string `json:"acceptance_rate"`
	ArticleCount    *int    `json:"article_count"`
	LetPubScore     *float64 `json:"letpub_score"`
	Xinrui          *string `json:"xinrui"`
	CAS2025         *string `json:"cas2025"`
	CAS2023         *string `json:"cas2023"`
	WoSZone         *string `json:"wos_zone"`
	JIF             *string `json:"jif"`
	JCIJson         *string `json:"jci_json"`
	CitescoreRankings *string `json:"citescore_rankings"`
}

// EntryListItem is a lightweight version for list views
type EntryListItem struct {
	ID           int     `json:"id"`
	Type         string  `json:"type"`
	CCFDomain    string  `json:"ccf_domain"`
	CCFLevel     string  `json:"ccf_level"`
	CCFAbbr      string  `json:"ccf_abbr"`
	CCFFull      string  `json:"ccf_full"`
	CCFPublisher string  `json:"ccf_publisher"`
	CCFUrl       string  `json:"ccf_url"`
	LetPubUrl    *string `json:"letpub_url"`
	ISSN         *string `json:"issn"`
	ImpactFactor *float64 `json:"impact_factor"`
	CiteScore    *float64 `json:"cite_score"`
	HIndex       *int    `json:"h_index"`
	CAS2025      *string `json:"cas2025"`
	Xinrui       *string `json:"xinrui"`
	WoSZone      *string `json:"wos_zone"`
	SCIType      *string `json:"sci_type"`
	ArticleCount *int    `json:"article_count"`
	LetPubScore  *float64 `json:"letpub_score"`
	IsFavorite   bool    `json:"is_favorite"`
	Tags         []string `json:"tags"`
	Note         string   `json:"note"`
}

// ScanEntry scans a full entry from a sql row
func ScanEntry(row *sql.Row) (*Entry, error) {
	e := &Entry{}
	err := row.Scan(
		&e.ID, &e.Type, &e.CCFDomain, &e.CCFLevel, &e.CCFAbbr, &e.CCFFull,
		&e.CCFPublisher, &e.CCFUrl, &e.LetPubUrl, &e.JournalID, &e.Name,
		&e.ISSN, &e.EISSN, &e.Publisher, &e.Country, &e.Language,
		&e.Periodicity, &e.ResearchArea, &e.IsOA, &e.GoldOARatio,
		&e.OfficialUrl, &e.SubmissionUrl, &e.SCIType,
		&e.ImpactFactor, &e.RealtimeIF, &e.FiveYearIF, &e.JCIValue,
		&e.HIndex, &e.CiteScore, &e.SJR, &e.SNIP,
		&e.SelfCitationRate, &e.ReviewSpeed, &e.AcceptanceRate,
		&e.ArticleCount, &e.LetPubScore,
		&e.Xinrui, &e.CAS2025, &e.CAS2023, &e.WoSZone,
		&e.JIF, &e.JCIJson, &e.CitescoreRankings,
	)
	if err != nil {
		return nil, err
	}
	return e, nil
}

// Favorite represents a user's favorite entry
type Favorite struct {
	ID        int    `json:"id"`
	DeviceID  string `json:"device_id"`
	UserID    *int   `json:"user_id"`
	EntryID   int    `json:"entry_id"`
	Tags      string `json:"tags"`
	CreatedAt string `json:"created_at"`
}

// FavoriteRequest is the request body for adding/removing favorites
type FavoriteRequest struct {
	DeviceID string   `json:"device_id"`
	EntryID  int      `json:"entry_id" binding:"required,min=1"`
	Tags     []string `json:"tags"`
}

// UpdateFavoriteTagsRequest is the request body for updating favorite tags
type UpdateFavoriteTagsRequest struct {
	DeviceID string   `json:"device_id"`
	EntryID  int      `json:"entry_id" binding:"required,min=1"`
	Tags     []string `json:"tags" binding:"required"`
}

// ListQuery represents query parameters for listing entries
type ListQuery struct {
	Type      string `form:"type"`
	Domain    string `form:"domain"`
	Level     string `form:"level"`
	CASZone   string `form:"cas_zone"`
	Q         string `form:"q"`
	Sort      string `form:"sort" binding:"omitempty,oneof=impact_factor cite_score name article_count ccf_level h_index letpub_score"`
	Order     string `form:"order" binding:"omitempty,oneof=asc desc"`
	Page      int    `form:"page" binding:"min=1"`
	PerPage   int    `form:"per_page" binding:"min=1,max=100"`
	DeviceID  string `form:"device_id"`
	Favorites bool   `form:"favorites"`
	Top       bool   `form:"top"`
	Tag       string `form:"tag"`
}

// Domains returns the list of domains (comma-separated)
func (q *ListQuery) Domains() []string {
	return splitMulti(q.Domain)
}

// Levels returns the list of levels (comma-separated)
func (q *ListQuery) Levels() []string {
	return splitMulti(q.Level)
}

// CASZones returns the list of CAS zones (comma-separated)
func (q *ListQuery) CASZones() []string {
	return splitMulti(q.CASZone)
}

func splitMulti(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

// Stats represents database statistics
type Stats struct {
	TotalJournals   int            `json:"total_journals"`
	TotalConferences int           `json:"total_conferences"`
	ByDomain        map[string]int `json:"by_domain"`
	ByLevel         map[string]int `json:"by_level"`
	ByCASZone       map[string]int `json:"by_cas_zone"`
}

// PaginatedResponse wraps list results with pagination
type PaginatedResponse struct {
	Data       []EntryListItem `json:"data"`
	Total      int64           `json:"total"`
	Page       int             `json:"page"`
	PerPage    int             `json:"per_page"`
	TotalPages int             `json:"total_pages"`
}

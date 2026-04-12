package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"ccf-directory/internal/model"
)

type EntryRepo struct {
	db *sql.DB
}

func NewEntryRepo(db *sql.DB) *EntryRepo {
	return &EntryRepo{db: db}
}

const entryColumns = `id, type, ccf_domain, ccf_level, ccf_abbr, ccf_full,
	ccf_publisher, ccf_url, letpub_url, journalid, name,
	issn, eissn, publisher, country, language,
	periodicity, research_area, is_oa, gold_oa_ratio,
	official_url, submission_url, sci_type,
	impact_factor, realtime_if, five_year_if, jci_value,
	h_index, cite_score, sjr, snip,
	self_citation_rate, review_speed, acceptance_rate,
	article_count, letpub_score,
	xinrui, cas2025, cas2023, wos_zone,
	jif, jci_json, citescore_rankings`

const listColumns = `e.id, e.type, e.ccf_domain, e.ccf_level, e.ccf_abbr, e.ccf_full,
	e.ccf_publisher, e.ccf_url, e.letpub_url, e.issn,
	e.impact_factor, e.cite_score, e.h_index,
	e.cas2025, e.xinrui, e.wos_zone, e.sci_type, e.article_count, e.letpub_score`

func (r *EntryRepo) GetByID(id int) (*model.Entry, error) {
	query := fmt.Sprintf("SELECT %s FROM entries WHERE id = ?", entryColumns)
	row := r.db.QueryRow(query, id)
	return model.ScanEntry(row)
}

// escapeLike escapes LIKE wildcard characters in user input
func escapeLike(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	s = strings.ReplaceAll(s, `_`, `\_`)
	return s
}

func (r *EntryRepo) List(q *model.ListQuery) ([]model.EntryListItem, int64, error) {
	var conditions []string
	var args []interface{}

	// Build WHERE conditions
	if q.Type != "" {
		conditions = append(conditions, "e.type = ?")
		args = append(args, q.Type)
	}
	if domains := q.Domains(); len(domains) > 0 {
		placeholders := make([]string, len(domains))
		for i, d := range domains {
			placeholders[i] = "?"
			args = append(args, d)
		}
		conditions = append(conditions, "e.ccf_domain IN ("+strings.Join(placeholders, ",")+")")
	}
	if levels := q.Levels(); len(levels) > 0 {
		placeholders := make([]string, len(levels))
		for i, l := range levels {
			placeholders[i] = "?"
			args = append(args, l)
		}
		conditions = append(conditions, "e.ccf_level IN ("+strings.Join(placeholders, ",")+")")
	}
	if casZones := q.CASZones(); len(casZones) > 0 {
		zoneConditions := make([]string, len(casZones))
		for i, z := range casZones {
			zoneConditions[i] = "e.cas2025 LIKE ? ESCAPE '\\'"
			args = append(args, fmt.Sprintf(`%%"bigZone":"%s区"%%`, escapeLike(strings.TrimSuffix(z, "区"))))
		}
		conditions = append(conditions, "("+strings.Join(zoneConditions, " OR ")+")")
	}
	if q.Q != "" {
		conditions = append(conditions, "(e.ccf_abbr LIKE ? ESCAPE '\\' OR e.ccf_full LIKE ? ESCAPE '\\' OR e.ccf_publisher LIKE ? ESCAPE '\\')")
		search := "%" + escapeLike(q.Q) + "%"
		args = append(args, search, search, search)
	}

	// Favorites filter
	if q.Favorites {
		if q.UserID != nil {
			conditions = append(conditions, "EXISTS (SELECT 1 FROM favorites f WHERE f.entry_id = e.id AND f.user_id = ?)")
			args = append(args, *q.UserID)
		} else if q.DeviceID != "" {
			conditions = append(conditions, "EXISTS (SELECT 1 FROM favorites f WHERE f.entry_id = e.id AND f.device_id = ? AND f.user_id IS NULL)")
			args = append(args, q.DeviceID)
		}
	}

	// Top journal filter (isTop in cas2025 or xinrui JSON)
	if q.Top {
		conditions = append(conditions, "(e.cas2025 LIKE '%\"isTop\":true%' OR e.xinrui LIKE '%\"isTop\":true%')")
	}

	// Tag filter (filter favorites by tag name in JSON)
	if q.Tag != "" && q.Favorites {
		if q.UserID != nil {
			conditions = append(conditions, "EXISTS (SELECT 1 FROM favorites f WHERE f.entry_id = e.id AND f.user_id = ? AND f.tags LIKE ?)")
			args = append(args, *q.UserID, `%"`+escapeLike(q.Tag)+`"%`)
		} else if q.DeviceID != "" {
			conditions = append(conditions, "EXISTS (SELECT 1 FROM favorites f WHERE f.entry_id = e.id AND f.device_id = ? AND f.user_id IS NULL AND f.tags LIKE ?)")
			args = append(args, q.DeviceID, `%"`+escapeLike(q.Tag)+`"%`)
		}
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Count total
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM entries e %s", whereClause)
	var total int64
	if err := r.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Sort
	sortMap := map[string]string{
		"impact_factor": "e.impact_factor",
		"cite_score":    "e.cite_score",
		"name":          "e.ccf_abbr",
		"article_count": "e.article_count",
		"ccf_level":     "e.ccf_level",
		"h_index":       "e.h_index",
		"letpub_score":  "e.letpub_score",
	}
	sortCol := "e.ccf_level, e.ccf_abbr"
	if q.Sort != "" {
		if col, ok := sortMap[q.Sort]; ok {
			sortCol = col
		}
	}
	order := "ASC"
	if q.Order == "desc" {
		order = "DESC"
	}
	if q.Sort != "" && q.Sort != "name" && q.Sort != "ccf_level" && q.Order == "" {
		order = "DESC"
	}

	// Pagination
	offset := (q.Page - 1) * q.PerPage

	// Is favorite subquery + tags + note
	favSubquery := ""
	favArgs := []interface{}{}
	if q.UserID != nil {
		favSubquery = `, COALESCE((SELECT f2.tags FROM favorites f2 WHERE f2.entry_id = e.id AND f2.user_id = ?), '[]') as tags, COALESCE((SELECT n.content FROM notes n WHERE n.entry_id = e.id AND n.user_id = ?), '') as note, EXISTS(SELECT 1 FROM favorites f WHERE f.entry_id = e.id AND f.user_id = ?) as is_favorite`
		favArgs = append(favArgs, *q.UserID, *q.UserID, *q.UserID)
	} else if q.DeviceID != "" {
		favSubquery = `, COALESCE((SELECT f2.tags FROM favorites f2 WHERE f2.entry_id = e.id AND f2.device_id = ? AND f2.user_id IS NULL), '[]') as tags, COALESCE((SELECT n.content FROM notes n WHERE n.entry_id = e.id AND n.device_id = ? AND n.user_id IS NULL), '') as note, EXISTS(SELECT 1 FROM favorites f WHERE f.entry_id = e.id AND f.device_id = ? AND f.user_id IS NULL) as is_favorite`
		favArgs = append(favArgs, q.DeviceID, q.DeviceID, q.DeviceID)
	} else {
		favSubquery = `, '[]' as tags, '' as note, 0 as is_favorite`
	}

	query := fmt.Sprintf(
		"SELECT %s%s FROM entries e %s ORDER BY %s %s LIMIT ? OFFSET ?",
		listColumns, favSubquery, whereClause, sortCol, order,
	)
	allArgs := make([]interface{}, 0, len(favArgs)+len(args)+2)
	allArgs = append(allArgs, favArgs...)   // SELECT subquery params come first (? appears before WHERE)
	allArgs = append(allArgs, args...)      // WHERE params
	allArgs = append(allArgs, q.PerPage, offset)

	rows, err := r.db.Query(query, allArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var items []model.EntryListItem
	for rows.Next() {
		var item model.EntryListItem
		var tagsJSON string
		err := rows.Scan(
			&item.ID, &item.Type, &item.CCFDomain, &item.CCFLevel,
			&item.CCFAbbr, &item.CCFFull, &item.CCFPublisher, &item.CCFUrl,
			&item.LetPubUrl, &item.ISSN, &item.ImpactFactor, &item.CiteScore,
			&item.HIndex, &item.CAS2025, &item.Xinrui, &item.WoSZone,
			&item.SCIType, &item.ArticleCount, &item.LetPubScore,
			&tagsJSON, &item.Note, &item.IsFavorite,
		)
		if err != nil {
			return nil, 0, err
		}
		json.Unmarshal([]byte(tagsJSON), &item.Tags)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	return items, total, nil
}

func (r *EntryRepo) GetStats() (*model.Stats, error) {
	stats := &model.Stats{
		ByDomain:  make(map[string]int),
		ByLevel:   make(map[string]int),
		ByCASZone: make(map[string]int),
	}

	// Total counts
	if err := r.db.QueryRow("SELECT COUNT(*) FROM entries WHERE type = 'journal'").Scan(&stats.TotalJournals); err != nil {
		return nil, err
	}
	if err := r.db.QueryRow("SELECT COUNT(*) FROM entries WHERE type = 'conference'").Scan(&stats.TotalConferences); err != nil {
		return nil, err
	}

	// By domain - use separate scope to avoid rows variable reuse
	func() {
		rows, err := r.db.Query("SELECT ccf_domain, COUNT(*) FROM entries GROUP BY ccf_domain")
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var domain string
			var count int
			if err := rows.Scan(&domain, &count); err != nil {
				return
			}
			stats.ByDomain[domain] = count
		}
	}()

	// By level
	func() {
		rows, err := r.db.Query("SELECT ccf_level, COUNT(*) FROM entries GROUP BY ccf_level ORDER BY ccf_level")
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var level string
			var count int
			if err := rows.Scan(&level, &count); err != nil {
				return
			}
			stats.ByLevel[level] = count
		}
	}()

	// By CAS zone
	func() {
		rows, err := r.db.Query(`SELECT 
			CASE 
				WHEN cas2025 LIKE '%"bigZone":"1区"%' THEN '1区'
				WHEN cas2025 LIKE '%"bigZone":"2区"%' THEN '2区'
				WHEN cas2025 LIKE '%"bigZone":"3区"%' THEN '3区'
				WHEN cas2025 LIKE '%"bigZone":"4区"%' THEN '4区'
				ELSE '未分区'
			END as zone,
			COUNT(*) 
			FROM entries WHERE type = 'journal' GROUP BY zone ORDER BY zone`)
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var zone string
			var count int
			if err := rows.Scan(&zone, &count); err != nil {
				return
			}
			stats.ByCASZone[zone] = count
		}
	}()

	return stats, nil
}

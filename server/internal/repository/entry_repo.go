package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
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
	ccf_publisher, ccf_url, ccf_relations, letpub_url, journalid, name,
	journal_abbr, issn, eissn, publisher, country, language,
	periodicity, research_area, is_oa, gold_oa_ratio,
	official_url, submission_url, sci_type,
	impact_factor, realtime_if, five_year_if, jci_value,
	h_index, cite_score, sjr, snip,
	self_citation_rate, review_speed, acceptance_rate,
	article_count, letpub_score,
	xinrui, cas2025, cas2023, wos_zone, wos_status, wos_reason,
	jif, jci_json, citescore_rankings,
	is_ccf, catalog_source, inclusion_reason, last_scraped_at, last_scrape_error`

const listColumns = `e.id, e.type, e.ccf_domain, e.ccf_level, e.ccf_abbr, e.ccf_full,
	e.ccf_publisher, e.ccf_url, e.ccf_relations, e.letpub_url, e.journalid, e.name, e.journal_abbr, e.issn, e.eissn, e.publisher,
	e.impact_factor, e.cite_score, e.h_index,
	e.cas2025, e.xinrui, e.wos_zone, e.wos_status, e.wos_reason, e.sci_type, e.article_count, e.letpub_score,
	e.is_ccf, e.catalog_source, e.inclusion_reason, e.last_scraped_at`

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

var ErrFavoriteOwnerRequired = errors.New("device_id or auth required")

// Include legacy primary memberships and all catalog relations. Filtering and
// statistics use the same pairs so a level must match within its own domain.
const memberships = `WITH memberships(entry_id, domain, level) AS (
	SELECT id, ccf_domain, ccf_level FROM entries
	UNION ALL
	SELECT e.id, json_extract(rel.value,'$.domain'), json_extract(rel.value,'$.level')
	FROM entries e, json_each(CASE WHEN json_valid(e.ccf_relations) THEN e.ccf_relations ELSE '[]' END) rel
	WHERE rel.type='object'
) `

func (r *EntryRepo) List(q *model.ListQuery) ([]model.EntryListItem, int64, error) {
	if q.Favorites && q.UserID == nil && q.DeviceID == "" {
		return nil, 0, ErrFavoriteOwnerRequired
	}
	var conditions []string
	var args []interface{}
	// Archived rows remain addressable for existing favorites and notes.
	if !q.Favorites {
		conditions = append(conditions, "e.catalog_source != 'historical_ccf'")
	}

	// Build WHERE conditions
	if q.Type != "" {
		conditions = append(conditions, "e.type = ?")
		args = append(args, q.Type)
	}
	if q.Catalog == "ccf" {
		conditions = append(conditions, "e.is_ccf = 1")
	} else if q.Catalog == "non_ccf" {
		conditions = append(conditions, "e.type = 'journal' AND e.is_ccf = 0 AND e.catalog_source != 'historical_ccf'")
	}
	domains, levels := q.Domains(), q.Levels()
	var prefix string
	if len(domains) > 0 || len(levels) > 0 {
		prefix = memberships
		var predicates []string
		for _, field := range []struct {
			column string
			values []string
		}{{"domain", domains}, {"level", levels}} {
			if len(field.values) == 0 {
				continue
			}
			placeholders := strings.TrimSuffix(strings.Repeat("?,", len(field.values)), ",")
			predicates = append(predicates, field.column+" IN ("+placeholders+")")
			for _, v := range field.values {
				args = append(args, v)
			}
		}
		conditions = append(conditions, "e.id IN (SELECT entry_id FROM memberships WHERE "+strings.Join(predicates, " AND ")+")")
	}
	if casZones := q.CASZones(); len(casZones) > 0 {
		zoneConditions := make([]string, len(casZones))
		for i, z := range casZones {
			zoneConditions[i] = "e.cas2025 LIKE ? ESCAPE '\\'"
			args = append(args, fmt.Sprintf(`%%"bigZone":"%s区"%%`, escapeLike(strings.TrimSuffix(z, "区"))))
		}
		conditions = append(conditions, "("+strings.Join(zoneConditions, " OR ")+")")
	}
	if wosZones := q.WoSZones(); len(wosZones) > 0 {
		placeholders := make([]string, len(wosZones))
		for i, z := range wosZones {
			placeholders[i] = "?"
			args = append(args, strings.TrimSuffix(z, "区")+"区")
		}
		conditions = append(conditions, "e.wos_zone IN ("+strings.Join(placeholders, ",")+")")
	}
	if q.Q != "" {
		conditions = append(conditions, "(e.ccf_abbr LIKE ? ESCAPE '\\' OR e.ccf_full LIKE ? ESCAPE '\\' OR e.ccf_publisher LIKE ? ESCAPE '\\' OR e.name LIKE ? ESCAPE '\\' OR e.journal_abbr LIKE ? ESCAPE '\\' OR e.publisher LIKE ? ESCAPE '\\' OR e.issn LIKE ? ESCAPE '\\' OR e.eissn LIKE ? ESCAPE '\\')")
		search := "%" + escapeLike(q.Q) + "%"
		args = append(args, search, search, search, search, search, search, search, search)
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

	// Top journal filter uses the latest official CAS partition, not Xinrui.
	if q.Top {
		conditions = append(conditions, "e.cas2025 LIKE '%\"isTop\":true%'")
	}

	// Tag filter (filter favorites by tag name in JSON)
	if q.Tag != "" && q.Favorites {
		if q.UserID != nil {
			conditions = append(conditions, "EXISTS (SELECT 1 FROM favorites f WHERE f.entry_id = e.id AND f.user_id = ? AND EXISTS (SELECT 1 FROM json_each(f.tags) tag WHERE tag.value = ?))")
			args = append(args, *q.UserID, q.Tag)
		} else if q.DeviceID != "" {
			conditions = append(conditions, "EXISTS (SELECT 1 FROM favorites f WHERE f.entry_id = e.id AND f.device_id = ? AND f.user_id IS NULL AND EXISTS (SELECT 1 FROM json_each(f.tags) tag WHERE tag.value = ?))")
			args = append(args, q.DeviceID, q.Tag)
		}
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Count total
	countQuery := prefix + fmt.Sprintf("SELECT COUNT(*) FROM entries e %s", whereClause)
	var total int64
	if err := r.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Sort
	sortMap := map[string]string{
		"impact_factor": "e.impact_factor",
		"cite_score":    "e.cite_score",
		"name":          "COALESCE(NULLIF(e.ccf_abbr, ''), NULLIF(e.journal_abbr, ''), NULLIF(e.name, ''), e.ccf_full)",
		"article_count": "e.article_count",
		"ccf_level":     "e.ccf_level",
		"h_index":       "e.h_index",
		"letpub_score":  "e.letpub_score",
	}
	sortCol := "e.is_ccf DESC, e.ccf_level, COALESCE(NULLIF(e.ccf_abbr, ''), NULLIF(e.journal_abbr, ''), NULLIF(e.name, ''), e.ccf_full)"
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

	query := prefix + fmt.Sprintf(
		"SELECT %s%s FROM entries e %s ORDER BY %s %s LIMIT ? OFFSET ?",
		listColumns, favSubquery, whereClause, sortCol, order,
	)
	allArgs := make([]interface{}, 0, len(favArgs)+len(args)+2)
	allArgs = append(allArgs, favArgs...) // SELECT subquery params come first (? appears before WHERE)
	allArgs = append(allArgs, args...)    // WHERE params
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
			&item.CCFAbbr, &item.CCFFull, &item.CCFPublisher, &item.CCFUrl, &item.CCFRelations,
			&item.LetPubUrl, &item.JournalID, &item.Name, &item.JournalAbbr, &item.ISSN, &item.EISSN, &item.Publisher,
			&item.ImpactFactor, &item.CiteScore,
			&item.HIndex, &item.CAS2025, &item.Xinrui, &item.WoSZone, &item.WoSStatus, &item.WoSReason,
			&item.SCIType, &item.ArticleCount, &item.LetPubScore,
			&item.IsCCF, &item.CatalogSource, &item.InclusionReason, &item.LastScrapedAt,
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
	var catalogJSON string
	if err := r.db.QueryRow("SELECT value FROM catalog_metadata WHERE key = 'journal_catalog'").Scan(&catalogJSON); err == nil && json.Valid([]byte(catalogJSON)) {
		stats.JournalCatalog = json.RawMessage(catalogJSON)
	}
	if err := r.db.QueryRow("SELECT COUNT(*) FROM entries WHERE type = 'journal' AND catalog_source != 'historical_ccf'").Scan(&stats.TotalJournals); err != nil {
		return nil, err
	}
	if err := r.db.QueryRow("SELECT COUNT(*) FROM entries WHERE type = 'conference'").Scan(&stats.TotalConferences); err != nil {
		return nil, err
	}
	if err := r.db.QueryRow("SELECT COUNT(*) FROM entries WHERE type = 'journal' AND is_ccf = 1").Scan(&stats.CCFJournals); err != nil {
		return nil, err
	}
	if err := r.db.QueryRow("SELECT COUNT(*) FROM entries WHERE type = 'journal' AND is_ccf = 0 AND catalog_source != 'historical_ccf'").Scan(&stats.NonCCFJournals); err != nil {
		return nil, err
	}
	var dataUpdatedAt sql.NullString
	if err := r.db.QueryRow(`
		SELECT MAX(last_scraped_at)
		FROM entries
		WHERE type = 'journal' AND last_scraped_at IS NOT NULL AND last_scraped_at != ''
	`).Scan(&dataUpdatedAt); err != nil {
		return nil, err
	}
	if dataUpdatedAt.Valid {
		stats.DataUpdatedAt = &dataUpdatedAt.String
	}

	for _, dimension := range []struct {
		column string
		counts map[string]int
	}{
		{"domain", stats.ByDomain}, {"level", stats.ByLevel},
	} {
		query := memberships + fmt.Sprintf(`SELECT m.%[1]s, COUNT(DISTINCT m.entry_id)
			FROM memberships m JOIN entries e ON e.id=m.entry_id
			WHERE e.catalog_source != 'historical_ccf' AND m.%[1]s IS NOT NULL GROUP BY m.%[1]s`, dimension.column)
		if err := r.readCounts(query, dimension.counts); err != nil {
			return nil, err
		}
	}

	// By CAS zone
	if err := r.readCounts(`SELECT
			CASE
				WHEN cas2025 LIKE '%"bigZone":"1区"%' THEN '1区'
				WHEN cas2025 LIKE '%"bigZone":"2区"%' THEN '2区'
				WHEN cas2025 LIKE '%"bigZone":"3区"%' THEN '3区'
				WHEN cas2025 LIKE '%"bigZone":"4区"%' THEN '4区'
				ELSE '未分区'
			END as zone,
			COUNT(*)
			FROM entries WHERE type = 'journal' AND catalog_source != 'historical_ccf' GROUP BY zone ORDER BY zone`, stats.ByCASZone); err != nil {
		return nil, err
	}
	return stats, nil
}

func (r *EntryRepo) readCounts(query string, counts map[string]int) error {
	rows, err := r.db.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var count int
		if err := rows.Scan(&key, &count); err != nil {
			return err
		}
		counts[key] = count
	}
	return rows.Err()
}

package repository

import (
	"database/sql"
	"encoding/json"
	"strings"

	"ccf-directory/internal/model"
)

type TagRepo struct {
	db *sql.DB
}

func NewTagRepo(db *sql.DB) *TagRepo {
	return &TagRepo{db: db}
}

func (r *TagRepo) Create(userID int, name, color string) (*model.Tag, error) {
	result, err := r.db.Exec(
		"INSERT INTO user_tags (user_id, name, color) VALUES (?, ?, ?)",
		userID, name, color,
	)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	return r.GetByID(int(id))
}

func (r *TagRepo) GetByID(id int) (*model.Tag, error) {
	t := &model.Tag{}
	err := r.db.QueryRow(
		"SELECT id, user_id, name, color, created_at FROM user_tags WHERE id = ?",
		id,
	).Scan(&t.ID, &t.UserID, &t.Name, &t.Color, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return t, nil
}

func (r *TagRepo) ListByUserID(userID int) ([]model.Tag, error) {
	rows, err := r.db.Query(
		"SELECT id, user_id, name, color, created_at FROM user_tags WHERE user_id = ? ORDER BY name",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []model.Tag
	for rows.Next() {
		var t model.Tag
		if err := rows.Scan(&t.ID, &t.UserID, &t.Name, &t.Color, &t.CreatedAt); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	return tags, nil
}

func (r *TagRepo) Update(id int, name, color string) (*model.Tag, error) {
	_, err := r.db.Exec(
		"UPDATE user_tags SET name = ?, color = ? WHERE id = ?",
		name, color, id,
	)
	if err != nil {
		return nil, err
	}
	return r.GetByID(id)
}

func (r *TagRepo) Delete(id int) error {
	_, err := r.db.Exec("DELETE FROM user_tags WHERE id = ?", id)
	return err
}

// IsTagInUse checks if a tag name is used in any favorite for the user
func (r *TagRepo) IsTagInUse(userID int, tagName string) (bool, error) {
	escaped := strings.ReplaceAll(tagName, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `%`, `\%`)
	escaped = strings.ReplaceAll(escaped, `_`, `\_`)
	var count int
	err := r.db.QueryRow(
		"SELECT COUNT(*) FROM favorites WHERE user_id = ? AND tags LIKE ? ESCAPE '\\'",
		userID, `%"`+escaped+`"%)`,
	).Scan(&count)
	return count > 0, err
}

// AggregateTagsFromFavorites extracts unique tag names from favorites.tags for device_id (guest users)
func (r *TagRepo) AggregateTagsFromFavorites(deviceID string) ([]model.TagDef, error) {
	rows, err := r.db.Query(
		"SELECT tags FROM favorites WHERE device_id = ? AND tags != '[]'",
		deviceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	seen := make(map[string]bool)
	var result []model.TagDef
	for rows.Next() {
		var tagsJSON string
		if err := rows.Scan(&tagsJSON); err != nil {
			return nil, err
		}
		var names []string
		if err := json.Unmarshal([]byte(tagsJSON), &names); err != nil {
			continue
		}
		for _, n := range names {
			if !seen[n] {
				seen[n] = true
				result = append(result, model.TagDef{Name: n})
			}
		}
	}
	return result, nil
}

// RemoveTagFromFavorites removes a tag name from all favorites.tags for a user
func (r *TagRepo) RemoveTagFromFavorites(tx *sql.Tx, userID int, tagName string) error {
	rows, err := tx.Query(
		"SELECT id, tags FROM favorites WHERE user_id = ? AND tags != '[]'",
		userID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	type favRow struct {
		id   int
		tags string
	}
	var favs []favRow
	for rows.Next() {
		var f favRow
		if err := rows.Scan(&f.id, &f.tags); err != nil {
			return err
		}
		favs = append(favs, f)
	}

	for _, f := range favs {
		var names []string
		if err := json.Unmarshal([]byte(f.tags), &names); err != nil {
			continue
		}
		filtered := make([]string, 0, len(names))
		for _, n := range names {
			if n != tagName {
				filtered = append(filtered, n)
			}
		}
		newJSON, _ := json.Marshal(filtered)
		if _, err := tx.Exec("UPDATE favorites SET tags = ? WHERE id = ?", string(newJSON), f.id); err != nil {
			return err
		}
	}
	return nil
}

// MergeDeviceTags extracts tags from device favorites and writes to user_tags
func (r *TagRepo) MergeDeviceTags(tx *sql.Tx, deviceID string, userID int) error {
	tagDefs, err := r.AggregateTagsFromFavorites(deviceID)
	if err != nil {
		return err
	}
	for _, td := range tagDefs {
		_, _ = tx.Exec(
			"INSERT OR IGNORE INTO user_tags (user_id, name) VALUES (?, ?)",
			userID, td.Name,
		)
	}
	return nil
}

package repository

import (
	"database/sql"
	"encoding/json"
	"errors"

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

func (r *TagRepo) Update(userID, id int, name, color string) (*model.Tag, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var tag model.Tag
	if err := tx.QueryRow("SELECT id, user_id, name, created_at FROM user_tags WHERE id = ? AND user_id = ?", id, userID).
		Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.CreatedAt); err != nil {
		return nil, err
	}
	if _, err := tx.Exec("UPDATE user_tags SET name = ?, color = ? WHERE id = ?", name, color, id); err != nil {
		return nil, err
	}
	if tag.Name != name {
		if _, err := tx.Exec(`UPDATE favorites SET tags = (
			SELECT json_group_array(DISTINCT CASE WHEN value = ? THEN ? ELSE value END) FROM json_each(favorites.tags)
		) WHERE user_id = ? AND EXISTS (SELECT 1 FROM json_each(favorites.tags) WHERE value = ?)`,
			tag.Name, name, userID, tag.Name); err != nil {
			return nil, err
		}
	}
	tag.Name, tag.Color = name, color
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &tag, nil
}

var ErrTagInUse = errors.New("tag in use")

func (r *TagRepo) Delete(userID, id int) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var name string
	if err := tx.QueryRow("SELECT name FROM user_tags WHERE user_id = ? AND id = ?", userID, id).Scan(&name); err != nil {
		return err
	}
	var inUse bool
	if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM favorites f, json_each(f.tags) tag
		WHERE f.user_id = ? AND tag.value = ?)`, userID, name).Scan(&inUse); err != nil {
		return err
	}
	if inUse {
		return ErrTagInUse
	}
	if _, err := tx.Exec("DELETE FROM user_tags WHERE id = ? AND user_id = ?", id, userID); err != nil {
		return err
	}
	return tx.Commit()
}

// AggregateTagsFromFavorites extracts unique tag names from favorites.tags for device_id (guest users)
func (r *TagRepo) AggregateTagsFromFavorites(deviceID string) ([]model.TagDef, error) {
	rows, err := r.db.Query(
		"SELECT tags FROM favorites WHERE device_id = ? AND user_id IS NULL AND tags != '[]'",
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
	return result, rows.Err()
}

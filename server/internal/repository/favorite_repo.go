package repository

import (
	"database/sql"
	"encoding/json"
)

type FavoriteRepo struct {
	db *sql.DB
}

func NewFavoriteRepo(db *sql.DB) *FavoriteRepo {
	return &FavoriteRepo{db: db}
}

func (r *FavoriteRepo) Add(deviceID string, userID *int, entryID int, tags []string) error {
	tagsJSON, _ := json.Marshal(tags)
	if userID != nil {
		_, err := r.db.Exec(
			"INSERT OR IGNORE INTO favorites (device_id, user_id, entry_id, tags) VALUES (?, ?, ?, ?)",
			"", *userID, entryID, string(tagsJSON),
		)
		return err
	}
	_, err := r.db.Exec(
		"INSERT OR IGNORE INTO favorites (device_id, entry_id, tags) VALUES (?, ?, ?)",
		deviceID, entryID, string(tagsJSON),
	)
	return err
}

func (r *FavoriteRepo) Remove(deviceID string, userID *int, entryID int) error {
	if userID != nil {
		_, err := r.db.Exec(
			"DELETE FROM favorites WHERE user_id = ? AND entry_id = ?",
			*userID, entryID,
		)
		return err
	}
	_, err := r.db.Exec(
		"DELETE FROM favorites WHERE device_id = ? AND user_id IS NULL AND entry_id = ?",
		deviceID, entryID,
	)
	return err
}

func (r *FavoriteRepo) ListEntryIDs(deviceID string, userID *int) ([]int, error) {
	var query string
	var args []interface{}
	if userID != nil {
		query = "SELECT entry_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC"
		args = []interface{}{*userID}
	} else {
		query = "SELECT entry_id FROM favorites WHERE device_id = ? AND user_id IS NULL ORDER BY created_at DESC"
		args = []interface{}{deviceID}
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func (r *FavoriteRepo) IsFavorite(deviceID string, userID *int, entryID int) (bool, error) {
	var count int
	var err error
	if userID != nil {
		err = r.db.QueryRow(
			"SELECT COUNT(*) FROM favorites WHERE user_id = ? AND entry_id = ?",
			*userID, entryID,
		).Scan(&count)
	} else {
		err = r.db.QueryRow(
			"SELECT COUNT(*) FROM favorites WHERE device_id = ? AND user_id IS NULL AND entry_id = ?",
			deviceID, entryID,
		).Scan(&count)
	}
	return count > 0, err
}

// GetTags returns the tags for a favorite entry
func (r *FavoriteRepo) GetTags(deviceID string, userID *int, entryID int) ([]string, error) {
	var tagsJSON string
	var err error
	if userID != nil {
		err = r.db.QueryRow(
			"SELECT tags FROM favorites WHERE user_id = ? AND entry_id = ?",
			*userID, entryID,
		).Scan(&tagsJSON)
	} else {
		err = r.db.QueryRow(
			"SELECT tags FROM favorites WHERE device_id = ? AND user_id IS NULL AND entry_id = ?",
			deviceID, entryID,
		).Scan(&tagsJSON)
	}
	if err == sql.ErrNoRows {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	var tags []string
	json.Unmarshal([]byte(tagsJSON), &tags)
	return tags, nil
}

// UpdateTags updates the tags for a favorite entry
func (r *FavoriteRepo) UpdateTags(deviceID string, userID *int, entryID int, tags []string) error {
	tagsJSON, _ := json.Marshal(tags)
	if userID != nil {
		_, err := r.db.Exec(
			"UPDATE favorites SET tags = ? WHERE user_id = ? AND entry_id = ?",
			string(tagsJSON), *userID, entryID,
		)
		return err
	}
	_, err := r.db.Exec(
		"UPDATE favorites SET tags = ? WHERE device_id = ? AND user_id IS NULL AND entry_id = ?",
		string(tagsJSON), deviceID, entryID,
	)
	return err
}

// GetTagsForEntries returns tags map for multiple entries (for list view)
func (r *FavoriteRepo) GetTagsForEntries(deviceID string, userID *int, entryIDs []int) (map[int][]string, error) {
	if len(entryIDs) == 0 {
		return map[int][]string{}, nil
	}

	placeholders := make([]string, len(entryIDs))
	args := make([]interface{}, len(entryIDs))
	for i, id := range entryIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	query := `SELECT entry_id, tags FROM favorites WHERE entry_id IN (` +
		joinFavPlaceholders(placeholders) + `) AND `
	if userID != nil {
		query += `user_id = ?`
		args = append(args, *userID)
	} else {
		query += `device_id = ? AND user_id IS NULL`
		args = append(args, deviceID)
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int][]string)
	for rows.Next() {
		var entryID int
		var tagsJSON string
		if err := rows.Scan(&entryID, &tagsJSON); err != nil {
			return nil, err
		}
		var tags []string
		json.Unmarshal([]byte(tagsJSON), &tags)
		result[entryID] = tags
	}
	return result, nil
}

func joinFavPlaceholders(p []string) string {
	result := ""
	for i, s := range p {
		if i > 0 {
			result += ","
		}
		result += s
	}
	return result
}

// MergeDeviceFavorites migrates device favorites to user account
func (r *FavoriteRepo) MergeDeviceFavorites(tx *sql.Tx, deviceID string, userID int) error {
	rows, err := tx.Query(
		"SELECT entry_id, tags FROM favorites WHERE device_id = ? AND user_id IS NULL",
		deviceID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	type favRow struct {
		entryID int
		tags    string
	}
	var deviceFavs []favRow
	for rows.Next() {
		var f favRow
		if err := rows.Scan(&f.entryID, &f.tags); err != nil {
			return err
		}
		deviceFavs = append(deviceFavs, f)
	}

	for _, f := range deviceFavs {
		var count int
		err := tx.QueryRow(
			"SELECT COUNT(*) FROM favorites WHERE user_id = ? AND entry_id = ?",
			userID, f.entryID,
		).Scan(&count)
		if err != nil {
			return err
		}

		if count == 0 {
			_, err := tx.Exec(
				"UPDATE favorites SET user_id = ?, device_id = ? WHERE device_id = ? AND user_id IS NULL AND entry_id = ?",
				userID, "", deviceID, f.entryID,
			)
			if err != nil {
				return err
			}
		}
		if count > 0 {
			_, err := tx.Exec(
				"DELETE FROM favorites WHERE device_id = ? AND user_id IS NULL AND entry_id = ?",
				deviceID, f.entryID,
			)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

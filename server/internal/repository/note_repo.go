package repository

import (
	"database/sql"
	"ccf-directory/internal/model"
)

type NoteRepo struct {
	db *sql.DB
}

func NewNoteRepo(db *sql.DB) *NoteRepo {
	return &NoteRepo{db: db}
}

// Upsert creates or updates a note for a given identity (device_id or user_id)
func (r *NoteRepo) Upsert(deviceID string, userID *int, entryID int, content string) error {
	if userID != nil {
		_, err := r.db.Exec(
			`INSERT INTO notes (device_id, user_id, entry_id, content, updated_at)
			 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
			 ON CONFLICT(device_id, entry_id) DO UPDATE SET
			   content = excluded.content,
			   updated_at = CURRENT_TIMESTAMP,
			   user_id = excluded.user_id`,
			deviceID, *userID, entryID, content,
		)
		return err
	}
	_, err := r.db.Exec(
		`INSERT INTO notes (device_id, user_id, entry_id, content, updated_at)
		 VALUES (?, NULL, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(device_id, entry_id) DO UPDATE SET
		   content = excluded.content,
		   updated_at = CURRENT_TIMESTAMP`,
		deviceID, entryID, content,
	)
	return err
}

func (r *NoteRepo) Delete(deviceID string, userID *int, entryID int) error {
	if userID != nil {
		_, err := r.db.Exec(
			"DELETE FROM notes WHERE user_id = ? AND entry_id = ?",
			*userID, entryID,
		)
		return err
	}
	_, err := r.db.Exec(
		"DELETE FROM notes WHERE device_id = ? AND user_id IS NULL AND entry_id = ?",
		deviceID, entryID,
	)
	return err
}

func (r *NoteRepo) ListByDeviceID(deviceID string) ([]model.NoteItem, error) {
	rows, err := r.db.Query(
		`SELECT n.entry_id, e.ccf_abbr, e.ccf_full, e.ccf_level, n.content, n.updated_at
		 FROM notes n JOIN entries e ON n.entry_id = e.id
		 WHERE n.device_id = ? AND n.user_id IS NULL
		 ORDER BY n.updated_at DESC`,
		deviceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.NoteItem
	for rows.Next() {
		var item model.NoteItem
		if err := rows.Scan(&item.EntryID, &item.CCFAbbr, &item.CCFFull, &item.CCFLevel, &item.Content, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (r *NoteRepo) ListByUserID(userID int) ([]model.NoteItem, error) {
	rows, err := r.db.Query(
		`SELECT n.entry_id, e.ccf_abbr, e.ccf_full, e.ccf_level, n.content, n.updated_at
		 FROM notes n JOIN entries e ON n.entry_id = e.id
		 WHERE n.user_id = ?
		 ORDER BY n.updated_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.NoteItem
	for rows.Next() {
		var item model.NoteItem
		if err := rows.Scan(&item.EntryID, &item.CCFAbbr, &item.CCFFull, &item.CCFLevel, &item.Content, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

// GetNote returns note content for a specific entry+identity
func (r *NoteRepo) GetNote(deviceID string, userID *int, entryID int) (string, error) {
	var content string
	var err error
	if userID != nil {
		err = r.db.QueryRow(
			"SELECT content FROM notes WHERE user_id = ? AND entry_id = ?",
			*userID, entryID,
		).Scan(&content)
	} else {
		err = r.db.QueryRow(
			"SELECT content FROM notes WHERE device_id = ? AND user_id IS NULL AND entry_id = ?",
			deviceID, entryID,
		).Scan(&content)
	}
	if err == sql.ErrNoRows {
		return "", nil
	}
	return content, err
}

// GetNotesForEntries returns notes map for multiple entries (for list view)
func (r *NoteRepo) GetNotesForEntries(deviceID string, userID *int, entryIDs []int) (map[int]string, error) {
	if len(entryIDs) == 0 {
		return map[int]string{}, nil
	}

	placeholders := make([]string, len(entryIDs))
	args := make([]interface{}, len(entryIDs))
	for i, id := range entryIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	query := `SELECT entry_id, content FROM notes WHERE entry_id IN (` +
		joinNotePlaceholders(placeholders) + `) AND `
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

	result := make(map[int]string)
	for rows.Next() {
		var entryID int
		var content string
		if err := rows.Scan(&entryID, &content); err != nil {
			return nil, err
		}
		result[entryID] = content
	}
	return result, nil
}

func joinNotePlaceholders(p []string) string {
	result := ""
	for i, s := range p {
		if i > 0 {
			result += ","
		}
		result += s
	}
	return result
}

// MergeDeviceNotes merges notes from device_id into user_id during login
func (r *NoteRepo) MergeDeviceNotes(tx *sql.Tx, deviceID string, userID int) error {
	rows, err := tx.Query(
		"SELECT entry_id, content, updated_at FROM notes WHERE device_id = ? AND user_id IS NULL",
		deviceID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	type noteRow struct {
		entryID   int
		content   string
		updatedAt string
	}
	var deviceNotes []noteRow
	for rows.Next() {
		var n noteRow
		if err := rows.Scan(&n.entryID, &n.content, &n.updatedAt); err != nil {
			return err
		}
		deviceNotes = append(deviceNotes, n)
	}

	for _, n := range deviceNotes {
		var existingUpdated string
		err := tx.QueryRow(
			"SELECT updated_at FROM notes WHERE user_id = ? AND entry_id = ?",
			userID, n.entryID,
		).Scan(&existingUpdated)

		if err == sql.ErrNoRows {
			_, err := tx.Exec(
				"UPDATE notes SET user_id = ?, device_id = ? WHERE device_id = ? AND user_id IS NULL AND entry_id = ?",
				userID, "", deviceID, n.entryID,
			)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

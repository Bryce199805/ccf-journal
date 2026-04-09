package repository

import (
	"database/sql"
)

type FavoriteRepo struct {
	db *sql.DB
}

func NewFavoriteRepo(db *sql.DB) *FavoriteRepo {
	return &FavoriteRepo{db: db}
}

func (r *FavoriteRepo) Add(deviceID string, entryID int) error {
	_, err := r.db.Exec(
		"INSERT OR IGNORE INTO favorites (device_id, entry_id) VALUES (?, ?)",
		deviceID, entryID,
	)
	return err
}

func (r *FavoriteRepo) Remove(deviceID string, entryID int) error {
	_, err := r.db.Exec(
		"DELETE FROM favorites WHERE device_id = ? AND entry_id = ?",
		deviceID, entryID,
	)
	return err
}

func (r *FavoriteRepo) ListEntryIDs(deviceID string) ([]int, error) {
	rows, err := r.db.Query(
		"SELECT entry_id FROM favorites WHERE device_id = ? ORDER BY created_at DESC",
		deviceID,
	)
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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return ids, nil
}

func (r *FavoriteRepo) IsFavorite(deviceID string, entryID int) (bool, error) {
	var count int
	err := r.db.QueryRow(
		"SELECT COUNT(*) FROM favorites WHERE device_id = ? AND entry_id = ?",
		deviceID, entryID,
	).Scan(&count)
	return count > 0, err
}

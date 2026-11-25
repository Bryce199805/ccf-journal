package repository

import (
	"database/sql"
	"errors"

	"ccf-directory/internal/model"
)

type UserRepo struct {
	db *sql.DB
}

func NewUserRepo(db *sql.DB) *UserRepo {
	return &UserRepo{db: db}
}

var ErrUsernameTaken = errors.New("username already exists")

func (r *UserRepo) Create(username, passwordHash, deviceID string) (*model.User, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var u model.User
	err = tx.QueryRow(`INSERT INTO users (username, password_hash) VALUES (?, ?)
		ON CONFLICT(username) DO NOTHING RETURNING id, username, created_at`, username, passwordHash).
		Scan(&u.ID, &u.Username, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrUsernameTaken
	}
	if err != nil {
		return nil, err
	}
	if deviceID != "" {
		if err := mergeDeviceData(tx, deviceID, u.ID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) GetByID(id int) (*model.User, error) {
	u := &model.User{}
	err := r.db.QueryRow(
		"SELECT id, username, password_hash, created_at FROM users WHERE id = ?",
		id,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (r *UserRepo) GetByUsername(username string) (*model.User, error) {
	u := &model.User{}
	err := r.db.QueryRow(
		"SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
		username,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}

// MergeDeviceData transfers guest data as one unit. Existing account favorites
// take precedence. A conflicting guest note stays on the device as before.
func (r *UserRepo) MergeDeviceData(deviceID string, userID int) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := mergeDeviceData(tx, deviceID, userID); err != nil {
		return err
	}
	return tx.Commit()
}

func mergeDeviceData(tx *sql.Tx, deviceID string, userID int) error {
	if _, err := tx.Exec(`
		INSERT INTO user_tags(user_id, name)
		SELECT DISTINCT ?, tag.value FROM favorites f, json_each(f.tags) tag
		WHERE f.device_id = ? AND f.user_id IS NULL AND tag.type = 'text'
		ON CONFLICT(user_id, name) DO NOTHING`, userID, deviceID); err != nil {
		return err
	}
	if _, err := tx.Exec(`
		DELETE FROM favorites AS guest WHERE device_id = ? AND user_id IS NULL
		AND EXISTS (SELECT 1 FROM favorites owned WHERE owned.user_id = ? AND owned.entry_id = guest.entry_id)`,
		deviceID, userID); err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE favorites SET user_id = ?, device_id = ?
		WHERE device_id = ? AND user_id IS NULL`, userID, accountDeviceID(userID), deviceID); err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE notes AS guest SET user_id = ?, device_id = ?
		WHERE device_id = ? AND user_id IS NULL
		AND NOT EXISTS (SELECT 1 FROM notes owned WHERE owned.user_id = ? AND owned.entry_id = guest.entry_id)`,
		userID, accountDeviceID(userID), deviceID, userID); err != nil {
		return err
	}
	return nil
}

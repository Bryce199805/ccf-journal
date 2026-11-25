package db

import (
	"database/sql"
	_ "embed"
	"fmt"
	"strings"
)

//go:embed migrations/001_personal_data.sql
var personalDataMigration string

// Migrate upgrades both new databases and installations predating schema versioning.
func Migrate(db *sql.DB, baseline string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var version int
	if err := tx.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return err
	}
	switch version {
	case 2:
		return nil
	case 0:
		if err := migrateLegacy(tx, baseline); err != nil {
			return err
		}
	case 1:
	default:
		return fmt.Errorf("unsupported database version %d", version)
	}
	if _, err := tx.Exec(journalLookupMigration); err != nil {
		return fmt.Errorf("migrate journal lookup indexes: %w", err)
	}
	return tx.Commit()
}

//go:embed migrations/002_journal_lookup.sql
var journalLookupMigration string

func migrateLegacy(tx *sql.Tx, baseline string) error {
	if _, err := tx.Exec(baseline); err != nil {
		return err
	}
	// Version-zero databases may already contain any subset of the legacy columns.
	for _, col := range []struct{ table, definition string }{
		{"favorites", "tags TEXT NOT NULL DEFAULT '[]'"},
		{"favorites", "user_id INTEGER REFERENCES users(id) ON DELETE CASCADE"},
		{"entries", "is_ccf INTEGER NOT NULL DEFAULT 1"},
		{"entries", "catalog_source TEXT NOT NULL DEFAULT 'ccf'"},
		{"entries", "inclusion_reason TEXT NOT NULL DEFAULT 'CCF推荐目录'"},
		{"entries", "last_scraped_at DATETIME"}, {"entries", "last_scrape_error TEXT"},
		{"entries", "ccf_relations TEXT"}, {"entries", "wos_status TEXT"},
		{"entries", "wos_reason TEXT"}, {"entries", "journal_abbr TEXT"},
	} {
		var exists bool
		name, _, _ := strings.Cut(col.definition, " ")
		if err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM pragma_table_info(?) WHERE name = ?)", col.table, name).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			if _, err := tx.Exec("ALTER TABLE " + col.table + " ADD COLUMN " + col.definition); err != nil {
				return err
			}
		}
	}
	if _, err := tx.Exec(personalDataMigration); err != nil {
		return fmt.Errorf("migrate personal data: %w", err)
	}
	return nil
}

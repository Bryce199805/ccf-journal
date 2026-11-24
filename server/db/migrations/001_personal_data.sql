-- Separate guest and account uniqueness, preserving personal record IDs and timestamps.
CREATE TABLE favorites_v1 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    tags TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO favorites_v1 (id, device_id, user_id, entry_id, created_at, tags)
SELECT id, device_id, user_id, entry_id, created_at, tags FROM favorites;

-- Older installations could hold the same account favorite on several devices.
WITH duplicates AS (
    SELECT user_id, entry_id, MIN(id) AS keep_id FROM favorites_v1
    WHERE user_id IS NOT NULL GROUP BY user_id, entry_id HAVING COUNT(*) > 1
)
UPDATE favorites_v1 AS f SET tags = (
    SELECT json_group_array(DISTINCT j.value) FROM favorites AS old, json_each(old.tags) AS j
    WHERE old.user_id = f.user_id AND old.entry_id = f.entry_id
) WHERE f.id IN (SELECT keep_id FROM duplicates);
DELETE FROM favorites_v1 WHERE user_id IS NOT NULL AND id NOT IN (
    SELECT MIN(id) FROM favorites_v1 WHERE user_id IS NOT NULL GROUP BY user_id, entry_id
);
DROP TABLE favorites;
ALTER TABLE favorites_v1 RENAME TO favorites;
CREATE UNIQUE INDEX idx_favorites_device_entry ON favorites(device_id, entry_id) WHERE user_id IS NULL;
CREATE UNIQUE INDEX idx_favorites_user_entry ON favorites(user_id, entry_id) WHERE user_id IS NOT NULL;

CREATE TABLE notes_v1 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO notes_v1 (id, device_id, user_id, entry_id, content, updated_at)
SELECT id, device_id, user_id, entry_id, content, updated_at FROM (
    SELECT *, ROW_NUMBER() OVER (
        PARTITION BY user_id, entry_id ORDER BY datetime(updated_at) DESC, id DESC
    ) AS account_rank FROM notes
) WHERE user_id IS NULL OR account_rank = 1;
DROP TABLE notes;
ALTER TABLE notes_v1 RENAME TO notes;
CREATE UNIQUE INDEX idx_notes_device_entry ON notes(device_id, entry_id) WHERE user_id IS NULL;
CREATE UNIQUE INDEX idx_notes_user_entry ON notes(user_id, entry_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_notes_entry ON notes(entry_id);
CREATE INDEX IF NOT EXISTS idx_entries_is_ccf ON entries(is_ccf);
CREATE INDEX IF NOT EXISTS idx_entries_catalog_source ON entries(catalog_source);
PRAGMA user_version = 1;

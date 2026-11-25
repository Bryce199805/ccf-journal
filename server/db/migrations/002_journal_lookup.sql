CREATE INDEX idx_journals_provider_id ON entries(journalid) WHERE type = 'journal';
CREATE INDEX idx_journals_eissn ON entries(eissn) WHERE type = 'journal';
CREATE INDEX idx_journals_full ON entries(ccf_full) WHERE type = 'journal';
PRAGMA user_version = 2;

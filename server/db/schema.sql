-- CCF Journal & Conference Directory Database Schema

CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,                -- journal / conference
    ccf_domain TEXT NOT NULL,          -- 领域
    ccf_level TEXT NOT NULL,           -- A / B / C
    ccf_abbr TEXT NOT NULL,            -- CCF简称
    ccf_full TEXT NOT NULL,            -- 全称
    ccf_publisher TEXT DEFAULT '',      -- 出版社/机构
    ccf_url TEXT DEFAULT '',           -- CCF官网链接
    ccf_relations TEXT,                -- 完整CCF多领域关系 JSON

    -- LetPub fields (NULL for conferences)
    letpub_url TEXT,                   -- LetPub详情页URL
    journalid TEXT,                    -- LetPub journal ID
    name TEXT,                         -- LetPub期刊名
    journal_abbr TEXT,                 -- LetPub检索列表中的中立期刊缩写
    issn TEXT,
    eissn TEXT,
    publisher TEXT,                    -- LetPub出版社
    country TEXT,
    language TEXT,
    periodicity TEXT,                  -- 出版周期
    research_area TEXT,                -- 研究领域
    is_oa TEXT,                        -- 是否OA
    gold_oa_ratio TEXT,                -- Gold OA比例
    official_url TEXT,                 -- 期刊官网
    submission_url TEXT,               -- 投稿链接
    sci_type TEXT,                     -- SCI类型(SCIE/SSCI等)
    impact_factor REAL,               -- 影响因子
    realtime_if REAL,                 -- 实时影响因子
    five_year_if REAL,                -- 5年影响因子
    jci_value REAL,                   -- JCI值
    h_index INTEGER,
    cite_score REAL,                   -- CiteScore
    sjr REAL,
    snip REAL,
    self_citation_rate TEXT,           -- 自引率
    review_speed TEXT,                 -- 审稿速度
    acceptance_rate TEXT,              -- 录取率
    article_count INTEGER,             -- 年文章数
    letpub_score REAL,                -- LetPub评分

    -- Partition data stored as JSON
    xinrui TEXT,                       -- 新锐分区 JSON
    cas2025 TEXT,                      -- 中科院2025分区 JSON
    cas2023 TEXT,                      -- 中科院2023分区 JSON
    wos_zone TEXT,                     -- WOS JCR分区
    wos_status TEXT,                   -- available/not_indexed/partition_unavailable/...
    wos_reason TEXT,                   -- WOS状态的机器可读原因
    jif TEXT,                          -- JIF学科排名 JSON array
    jci_json TEXT,                     -- JCI学科排名 JSON array
    citescore_rankings TEXT,           -- CiteScore排名 JSON array

    -- Catalog/update metadata. CCF is one catalog, not the journal identity.
    is_ccf INTEGER NOT NULL DEFAULT 1,
    catalog_source TEXT NOT NULL DEFAULT 'ccf',
    inclusion_reason TEXT NOT NULL DEFAULT 'CCF推荐目录',
    last_scraped_at DATETIME,
    last_scrape_error TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,           -- 客户端UUID, 存localStorage
    entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, entry_id)
);

-- User accounts for cross-device sync
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notes (independent of favorites - any entry can have notes)
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, entry_id)
);

-- Tag definitions for logged-in users
CREATE TABLE IF NOT EXISTS user_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
CREATE INDEX IF NOT EXISTS idx_entries_domain ON entries(ccf_domain);
CREATE INDEX IF NOT EXISTS idx_entries_level ON entries(ccf_level);
CREATE INDEX IF NOT EXISTS idx_entries_type_domain_level ON entries(type, ccf_domain, ccf_level);
CREATE INDEX IF NOT EXISTS idx_entries_issn ON entries(issn);
CREATE INDEX IF NOT EXISTS idx_entries_impact_factor ON entries(impact_factor DESC);
CREATE INDEX IF NOT EXISTS idx_entries_cite_score ON entries(cite_score DESC);
CREATE INDEX IF NOT EXISTS idx_entries_abbr ON entries(ccf_abbr);
CREATE INDEX IF NOT EXISTS idx_favorites_device ON favorites(device_id);
CREATE INDEX IF NOT EXISTS idx_favorites_device_entry ON favorites(device_id, entry_id);
CREATE INDEX IF NOT EXISTS idx_notes_device ON notes(device_id);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_entry ON notes(entry_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

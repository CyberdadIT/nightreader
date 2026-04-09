-- NightReader database schema
-- Migration 001: initial tables

CREATE TABLE IF NOT EXISTS bookmarks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path   TEXT    NOT NULL,
    page        INTEGER NOT NULL,
    title       TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS annotations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path   TEXT    NOT NULL,
    page        INTEGER NOT NULL,
    quote       TEXT    NOT NULL DEFAULT '',
    type        TEXT    NOT NULL DEFAULT 'hl-yellow',
    note        TEXT    NOT NULL DEFAULT '',
    color       TEXT    NOT NULL DEFAULT 'yellow',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reading_progress (
    file_path   TEXT PRIMARY KEY,
    page        INTEGER NOT NULL DEFAULT 1,
    total_pages INTEGER NOT NULL DEFAULT 0,
    last_read   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
);

-- Seed default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('readingMode', 'dark'),
    ('font',        'serif'),
    ('fontSize',    '15'),
    ('lineHeight',  '1.9'),
    ('brightness',  '100');

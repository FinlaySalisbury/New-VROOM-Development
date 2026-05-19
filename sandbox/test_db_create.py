import sqlite3

conn = sqlite3.connect('/data/sandbox_history.db')
c = conn.cursor()
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS engineers (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS job_lists (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS global_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""
c.executescript(CREATE_TABLE_SQL)
conn.commit()
print("Tables created")

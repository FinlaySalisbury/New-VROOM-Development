import sqlite3
import json

conn = sqlite3.connect('/data/sandbox_history.db')
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in c.fetchall()]
print('Tables:', tables)
if 'engineers' in tables:
    c.execute('SELECT COUNT(*) FROM engineers')
    print('Engineers:', c.fetchone()[0])
if 'job_lists' in tables:
    c.execute('SELECT COUNT(*) FROM job_lists')
    print('Job Lists:', c.fetchone()[0])
conn.close()

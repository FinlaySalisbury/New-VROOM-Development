import sqlite3
import json

conn = sqlite3.connect('/app/sandbox_history.db')
c = conn.cursor()
c.execute('SELECT name FROM sqlite_master WHERE type="table"')
print('Tables:', [r[0] for r in c.fetchall()])
try:
    c.execute('SELECT data FROM engineers')
    rows = c.fetchall()
    print('Engineers:', len(rows))
    for row in rows:
        data = json.loads(row[0])
        print('-', data.get('name'))
except Exception as e:
    print('Error:', e)

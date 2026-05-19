import sqlite3
import json

conn = sqlite3.connect('/data/sandbox_history.db')
c = conn.cursor()
c.execute('SELECT data FROM engineers')
rows = c.fetchall()
print('Engineers count:', len(rows))
for row in rows:
    data = json.loads(row[0])
    print('-', data.get('name'), 'Skills:', data.get('skills'))

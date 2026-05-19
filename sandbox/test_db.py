import sqlite3
import sys

def main():
    try:
        conn = sqlite3.connect('/data/sandbox_history.db')
        c = conn.cursor()
        c.execute("SELECT name FROM sqlite_master WHERE type='table'")
        print("Tables:", [row[0] for row in c.fetchall()])
        c.execute("SELECT COUNT(*) FROM engineers")
        print("Engineers count:", c.fetchone()[0])
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    main()

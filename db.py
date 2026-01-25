import sqlite3
from pathlib import Path

#CONNECT AND TUNNEL INTO THE DATABASE
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "MoVE.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
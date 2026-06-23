import sqlite3
from pathlib import Path

from pathlib import Path
import os
import sqlite3

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BASE_DIR / "data" / "MoVE.db"
DB_PATH = Path(os.getenv("MOVE_DB_PATH", str(DEFAULT_DB_PATH)))

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

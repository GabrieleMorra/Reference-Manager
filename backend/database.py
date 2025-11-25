import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'references.db')

def init_database():
    """Initialize the database with required tables"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Projects table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Topics table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            position_x REAL DEFAULT 0,
            position_y REAL DEFAULT 0,
            color TEXT DEFAULT '#007bff',
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        )
    ''')

    # References table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS paper_references (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            doi TEXT,
            authors TEXT,
            abstract TEXT,
            notes TEXT,
            citation_count INTEGER DEFAULT 0,
            publication_year INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE CASCADE
        )
    ''')

    # Add citation_count column if it doesn't exist (for existing databases)
    try:
        cursor.execute('ALTER TABLE paper_references ADD COLUMN citation_count INTEGER DEFAULT 0')
    except sqlite3.OperationalError:
        pass

    # Add publication_year column if it doesn't exist (for existing databases)
    try:
        cursor.execute('ALTER TABLE paper_references ADD COLUMN publication_year INTEGER')
    except sqlite3.OperationalError:
        pass

    # Reference connections table (for arrows between references)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reference_connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_reference_id INTEGER NOT NULL,
            target_reference_id INTEGER NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source_reference_id) REFERENCES paper_references (id) ON DELETE CASCADE,
            FOREIGN KEY (target_reference_id) REFERENCES paper_references (id) ON DELETE CASCADE
        )
    ''')

    conn.commit()
    conn.close()

def get_connection():
    """Get a database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

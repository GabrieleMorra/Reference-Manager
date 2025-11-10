from database import get_connection

def get_all_projects():
    """Get all projects"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM projects ORDER BY created_at DESC')
    projects = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return projects

def create_project(title):
    """Create a new project"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO projects (title) VALUES (?)', (title,))
    project_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return project_id

def get_project_by_id(project_id):
    """Get a single project by ID"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM projects WHERE id = ?', (project_id,))
    project = cursor.fetchone()
    conn.close()
    return dict(project) if project else None

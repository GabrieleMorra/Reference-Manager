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

def update_project_title(project_id, new_title):
    """Update project title"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE projects SET title = ? WHERE id = ?', (new_title, project_id))
    conn.commit()
    conn.close()
    return True

def delete_project(project_id):
    """Delete project and all related data (cascade)"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM projects WHERE id = ?', (project_id,))
    conn.commit()
    conn.close()
    return True

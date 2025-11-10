from database import get_connection

def get_topics_by_project(project_id):
    """Get all topics for a project"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM topics WHERE project_id = ?', (project_id,))
    topics = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return topics

def create_topic(project_id, name, position_x=0, position_y=0):
    """Create a new topic"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO topics (project_id, name, position_x, position_y) VALUES (?, ?, ?, ?)',
        (project_id, name, position_x, position_y)
    )
    topic_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return topic_id

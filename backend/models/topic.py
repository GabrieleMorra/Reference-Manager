from database import get_connection

def get_topics_by_project(project_id):
    """Get all topics for a project with their references"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM topics WHERE project_id = ?', (project_id,))
    topics = [dict(row) for row in cursor.fetchall()]

    # Load references for each topic
    for topic in topics:
        cursor.execute('SELECT * FROM paper_references WHERE topic_id = ?', (topic['id'],))
        topic['references'] = [dict(ref) for ref in cursor.fetchall()]

    conn.close()
    return topics

def create_topic(project_id, name, position_x=0, position_y=0, color='#007bff'):
    """Create a new topic"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO topics (project_id, name, position_x, position_y, color) VALUES (?, ?, ?, ?, ?)',
        (project_id, name, position_x, position_y, color)
    )
    topic_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return topic_id

def update_topic_name(topic_id, new_name):
    """Update topic name"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE topics SET name = ? WHERE id = ?', (new_name, topic_id))
    conn.commit()
    conn.close()
    return True

def update_topic_position(topic_id, position_x, position_y):
    """Update topic position"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE topics SET position_x = ?, position_y = ? WHERE id = ?',
                   (position_x, position_y, topic_id))
    conn.commit()
    conn.close()
    return True

def update_topic_dimensions(topic_id, grid_width, grid_height):
    """Update topic grid dimensions"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE topics SET grid_width = ?, grid_height = ? WHERE id = ?',
                   (grid_width, grid_height, topic_id))
    conn.commit()
    conn.close()
    return True

def delete_topic(topic_id):
    """Delete topic and all related references (cascade)"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM topics WHERE id = ?', (topic_id,))
    conn.commit()
    conn.close()
    return True

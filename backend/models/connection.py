from database import get_connection

def create_connection(source_reference_id, target_reference_id, description=''):
    """Create a new connection between two references"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        'INSERT INTO reference_connections (source_reference_id, target_reference_id, description) VALUES (?, ?, ?)',
        (source_reference_id, target_reference_id, description)
    )

    connection_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return connection_id

def get_connections_by_project(project_id):
    """Get all connections for references in a project"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT rc.*,
               pr1.topic_id as source_topic_id,
               pr2.topic_id as target_topic_id
        FROM reference_connections rc
        JOIN paper_references pr1 ON rc.source_reference_id = pr1.id
        JOIN paper_references pr2 ON rc.target_reference_id = pr2.id
        JOIN topics t1 ON pr1.topic_id = t1.id
        WHERE t1.project_id = ?
    ''', (project_id,))

    connections = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return connections

def update_connection(connection_id, description):
    """Update a connection's description"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        'UPDATE reference_connections SET description = ? WHERE id = ?',
        (description, connection_id)
    )

    conn.commit()
    conn.close()

def delete_connection(connection_id):
    """Delete a connection"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('DELETE FROM reference_connections WHERE id = ?', (connection_id,))

    conn.commit()
    conn.close()

def get_connection_by_id(connection_id):
    """Get a specific connection by ID"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM reference_connections WHERE id = ?', (connection_id,))

    connection = cursor.fetchone()
    conn.close()

    return dict(connection) if connection else None

from database import get_connection

def get_topics_by_project(project_id):
    """Get all topics for a project with their references (single JOIN query)"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT t.*, pr.id AS ref_id, pr.topic_id AS ref_topic_id, pr.title AS ref_title,
               pr.doi AS ref_doi, pr.authors AS ref_authors, pr.abstract AS ref_abstract,
               pr.notes AS ref_notes, pr.citation_count AS ref_citation_count,
               pr.publication_year AS ref_publication_year, pr.created_at AS ref_created_at,
               pr.bibtex AS ref_bibtex, pr.pdf_path AS ref_pdf_path
        FROM topics t
        LEFT JOIN paper_references pr ON pr.topic_id = t.id
        WHERE t.project_id = ?
        ORDER BY t.id, pr.sort_order ASC, pr.id ASC
    ''', (project_id,))

    rows = cursor.fetchall()
    conn.close()

    topics_map = {}
    for row in rows:
        row = dict(row)
        topic_id = row['id']
        if topic_id not in topics_map:
            topics_map[topic_id] = {
                'id': row['id'],
                'project_id': row['project_id'],
                'name': row['name'],
                'position_x': row['position_x'],
                'position_y': row['position_y'],
                'color': row['color'],
                'grid_width': row['grid_width'],
                'grid_height': row['grid_height'],
                'references': []
            }
        if row['ref_id'] is not None:
            topics_map[topic_id]['references'].append({
                'id': row['ref_id'],
                'topic_id': row['ref_topic_id'],
                'title': row['ref_title'],
                'doi': row['ref_doi'],
                'authors': row['ref_authors'],
                'abstract': row['ref_abstract'],
                'notes': row['ref_notes'],
                'citation_count': row['ref_citation_count'],
                'publication_year': row['ref_publication_year'],
                'created_at': row['ref_created_at'],
                'bibtex': row['ref_bibtex'],
                'pdf_path': row['ref_pdf_path'],
            })

    return list(topics_map.values())


def get_topics_by_project_summary(project_id):
    """Get topics with lightweight reference data for canvas rendering"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT t.*, pr.id AS ref_id, pr.title AS ref_title, pr.doi AS ref_doi,
               pr.authors AS ref_authors, pr.citation_count AS ref_citation_count,
               pr.publication_year AS ref_publication_year
        FROM topics t
        LEFT JOIN paper_references pr ON pr.topic_id = t.id
        WHERE t.project_id = ?
        ORDER BY t.id, pr.sort_order ASC, pr.id ASC
    ''', (project_id,))

    rows = cursor.fetchall()
    conn.close()

    topics_map = {}
    for row in rows:
        row = dict(row)
        topic_id = row['id']
        if topic_id not in topics_map:
            topics_map[topic_id] = {
                'id': row['id'],
                'project_id': row['project_id'],
                'name': row['name'],
                'position_x': row['position_x'],
                'position_y': row['position_y'],
                'color': row['color'],
                'grid_width': row['grid_width'],
                'grid_height': row['grid_height'],
                'references': []
            }
        if row['ref_id'] is not None:
            topics_map[topic_id]['references'].append({
                'id': row['ref_id'],
                'title': row['ref_title'],
                'doi': row['ref_doi'],
                'authors': row['ref_authors'],
                'citation_count': row['ref_citation_count'],
                'publication_year': row['ref_publication_year'],
            })

    return list(topics_map.values())

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

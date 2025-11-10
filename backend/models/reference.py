from database import get_connection

def get_references_by_topic(topic_id):
    """Get all references for a topic"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM paper_references WHERE topic_id = ?', (topic_id,))
    references = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return references

def create_reference(topic_id, title, doi='', authors='', abstract='', notes=''):
    """Create a new reference"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        '''INSERT INTO paper_references (topic_id, title, doi, authors, abstract, notes)
           VALUES (?, ?, ?, ?, ?, ?)''',
        (topic_id, title, doi, authors, abstract, notes)
    )
    reference_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return reference_id

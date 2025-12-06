from database import get_connection

def get_references_by_topic(topic_id):
    """Get all references for a topic"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM paper_references WHERE topic_id = ?', (topic_id,))
    references = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return references

def create_reference(topic_id, title, doi='', authors='', abstract='', notes='', citation_count=0, publication_year=None, bibtex=''):
    """Create a new reference"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        '''INSERT INTO paper_references (topic_id, title, doi, authors, abstract, notes, citation_count, publication_year, bibtex)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (topic_id, title, doi, authors, abstract, notes, citation_count, publication_year, bibtex)
    )
    reference_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return reference_id

def update_reference(reference_id, title, doi='', authors='', abstract='', notes='', citation_count=0, publication_year=None, bibtex=''):
    """Update a reference"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        '''UPDATE paper_references
           SET title = ?, doi = ?, authors = ?, abstract = ?, notes = ?, citation_count = ?, publication_year = ?, bibtex = ?
           WHERE id = ?''',
        (title, doi, authors, abstract, notes, citation_count, publication_year, bibtex, reference_id)
    )
    conn.commit()
    conn.close()
    return True

def delete_reference(reference_id):
    """Delete a reference"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM paper_references WHERE id = ?', (reference_id,))
    conn.commit()
    conn.close()
    return True

def move_reference(reference_id, target_topic_id):
    """Move a reference to another topic"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        'UPDATE paper_references SET topic_id = ? WHERE id = ?',
        (target_topic_id, reference_id)
    )
    conn.commit()
    conn.close()
    return True

def duplicate_reference(reference_id, target_topic_id):
    """Duplicate a reference to another topic"""
    conn = get_connection()
    cursor = conn.cursor()

    # Get the original reference
    cursor.execute('SELECT * FROM paper_references WHERE id = ?', (reference_id,))
    original = cursor.fetchone()

    if not original:
        conn.close()
        return None

    # Create a copy in the target topic
    cursor.execute(
        '''INSERT INTO paper_references (topic_id, title, doi, authors, abstract, notes, citation_count, publication_year, bibtex)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (target_topic_id, original['title'], original['doi'], original['authors'],
         original['abstract'], original['notes'], original['citation_count'], original['publication_year'], original.get('bibtex', ''))
    )
    new_reference_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_reference_id

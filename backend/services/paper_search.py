from pyalex import Works

def search_papers(query, search_type='title', limit=10):
    """
    Search for papers using OpenAlex API

    Args:
        query: Search query string
        search_type: 'title', 'author', or 'doi'
        limit: Maximum number of results (default 10)

    Returns:
        List of paper metadata dictionaries
    """
    try:
        if search_type == 'doi':
            # Direct DOI lookup
            results = Works().filter(doi=query).get()
        elif search_type == 'author':
            # Search by author name
            results = Works().search(query).filter(display_name=query).get()
        else:
            # Default: search by title
            results = Works().search(query).get()

        papers = []
        count = 0

        for work in results:
            if count >= limit:
                break

            # Extract authors
            authors_list = []
            if work.get('authorships'):
                for authorship in work['authorships']:
                    author = authorship.get('author', {})
                    if author and author.get('display_name'):
                        authors_list.append(author['display_name'])

            authors_str = ', '.join(authors_list) if authors_list else ''

            # Extract publication year
            pub_year = work.get('publication_year', '')

            # Build paper object
            paper = {
                'id': work.get('id', ''),
                'title': work.get('title', 'Untitled'),
                'doi': work.get('doi', '').replace('https://doi.org/', '') if work.get('doi') else '',
                'authors': authors_str,
                'abstract': work.get('abstract', ''),
                'year': pub_year,
                'venue': work.get('primary_location', {}).get('source', {}).get('display_name', ''),
                'citation_count': work.get('cited_by_count', 0),
                'url': work.get('doi', '') or work.get('id', ''),
            }

            papers.append(paper)
            count += 1

        return papers

    except Exception as e:
        print(f"Error searching papers: {e}")
        return []

def get_paper_by_doi(doi):
    """
    Get a single paper by DOI

    Args:
        doi: DOI identifier

    Returns:
        Paper metadata dictionary or None
    """
    try:
        # Clean DOI (remove https://doi.org/ prefix if present)
        clean_doi = doi.replace('https://doi.org/', '')

        results = Works().filter(doi=clean_doi).get()

        for work in results:
            # Extract authors
            authors_list = []
            if work.get('authorships'):
                for authorship in work['authorships']:
                    author = authorship.get('author', {})
                    if author and author.get('display_name'):
                        authors_list.append(author['display_name'])

            authors_str = ', '.join(authors_list) if authors_list else ''

            paper = {
                'id': work.get('id', ''),
                'title': work.get('title', 'Untitled'),
                'doi': work.get('doi', '').replace('https://doi.org/', '') if work.get('doi') else '',
                'authors': authors_str,
                'abstract': work.get('abstract', ''),
                'year': work.get('publication_year', ''),
                'venue': work.get('primary_location', {}).get('source', {}).get('display_name', ''),
                'citation_count': work.get('cited_by_count', 0),
                'url': work.get('doi', '') or work.get('id', ''),
            }

            return paper

        return None

    except Exception as e:
        print(f"Error fetching paper by DOI: {e}")
        return None

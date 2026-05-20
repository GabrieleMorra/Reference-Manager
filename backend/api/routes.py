import io
import os
import re
import uuid
import zipfile
from flask import Blueprint, request, jsonify, send_file, Response
from models import project, topic, reference, connection
from services import paper_search

api = Blueprint('api', __name__)

# PDF storage directory (alongside the SQLite database)
PDF_STORAGE_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'database', 'pdfs')
os.makedirs(PDF_STORAGE_DIR, exist_ok=True)


def _safe_segment(name, fallback='untitled'):
    """Sanitize a string to be safe as a filename or folder name on Windows/Linux."""
    if not name:
        return fallback
    # Replace invalid filename characters with underscore
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name).strip()
    # Trim trailing dots/spaces (Windows-hostile)
    cleaned = cleaned.rstrip('. ').strip()
    # Avoid empty
    return cleaned or fallback


def _abs_pdf_path(relative_path):
    """Resolve a stored relative pdf_path to an absolute path on disk."""
    if not relative_path:
        return None
    # Stored paths are relative — anchor them under PDF_STORAGE_DIR
    return os.path.abspath(os.path.join(PDF_STORAGE_DIR, relative_path))


def _branded_pdf_path(reference_id, source_abs_path, title):
    """Return the path to a copy of the PDF whose /Info /Title metadata equals
    `title`. Chromium's built-in PDF viewer uses /Title (when present) as the
    name it displays in its toolbar — without this, the viewer falls back to
    the cache-temp filename ("[hash].tmp"). The branded copy is cached on
    disk and rebuilt only when the source PDF or the title changes.
    """
    try:
        from pypdf import PdfReader, PdfWriter
    except Exception:
        return source_abs_path  # pypdf not available — serve original

    if not title:
        return source_abs_path

    cache_dir = os.path.join(PDF_STORAGE_DIR, '_branded')
    os.makedirs(cache_dir, exist_ok=True)

    # Cache key: ref id + source mtime + title hash → invalidates on any change
    try:
        src_mtime = int(os.path.getmtime(source_abs_path))
    except OSError:
        return source_abs_path
    import hashlib
    key = hashlib.sha1(f'{reference_id}|{src_mtime}|{title}'.encode('utf-8')).hexdigest()[:16]
    cached = os.path.join(cache_dir, f'{reference_id}_{key}.pdf')

    if os.path.exists(cached):
        return cached

    # Drop stale branded copies for this reference
    try:
        for f in os.listdir(cache_dir):
            if f.startswith(f'{reference_id}_') and f != os.path.basename(cached):
                try:
                    os.remove(os.path.join(cache_dir, f))
                except OSError:
                    pass
    except OSError:
        pass

    try:
        reader = PdfReader(source_abs_path)
        writer = PdfWriter(clone_from=reader)
        # Preserve any existing metadata, override /Title
        existing = dict(reader.metadata or {})
        existing['/Title'] = title
        writer.add_metadata(existing)
        with open(cached, 'wb') as out:
            writer.write(out)
        return cached
    except Exception:
        # Any pypdf failure (encrypted PDF, malformed, etc.) — serve original
        return source_abs_path

# Project routes
@api.route('/projects', methods=['GET'])
def get_projects():
    projects = project.get_all_projects()
    return jsonify(projects)

@api.route('/projects', methods=['POST'])
def create_project():
    data = request.json
    project_id = project.create_project(data['title'])
    return jsonify({'id': project_id}), 201

@api.route('/projects/<int:project_id>', methods=['GET'])
def get_project(project_id):
    proj = project.get_project_by_id(project_id)
    if proj:
        return jsonify(proj)
    return jsonify({'error': 'Project not found'}), 404

@api.route('/projects/<int:project_id>', methods=['PUT'])
def update_project(project_id):
    data = request.json
    new_title = data.get('title')
    if not new_title:
        return jsonify({'error': 'Title is required'}), 400

    project.update_project_title(project_id, new_title)
    return jsonify({'success': True})

@api.route('/projects/<int:project_id>', methods=['DELETE'])
def delete_project_route(project_id):
    project.delete_project(project_id)
    return jsonify({'success': True})

# Topic routes
@api.route('/projects/<int:project_id>/topics', methods=['GET'])
def get_topics(project_id):
    fields = request.args.get('fields', '')
    if fields == 'summary':
        topics = topic.get_topics_by_project_summary(project_id)
    else:
        topics = topic.get_topics_by_project(project_id)
    return jsonify(topics)

@api.route('/projects/<int:project_id>/topics', methods=['POST'])
def create_topic(project_id):
    data = request.json
    topic_id = topic.create_topic(
        project_id,
        data['name'],
        data.get('position_x', 0),
        data.get('position_y', 0),
        data.get('color', '#007bff')
    )
    return jsonify({'id': topic_id}), 201

@api.route('/topics/<int:topic_id>', methods=['PUT'])
def update_topic(topic_id):
    data = request.json
    new_name = data.get('name')
    if not new_name:
        return jsonify({'error': 'Name is required'}), 400

    topic.update_topic_name(topic_id, new_name)
    return jsonify({'success': True})

@api.route('/topics/<int:topic_id>', methods=['DELETE'])
def delete_topic_route(topic_id):
    topic.delete_topic(topic_id)
    return jsonify({'success': True})

@api.route('/topics/<int:topic_id>/position', methods=['PUT'])
def update_topic_position(topic_id):
    data = request.json
    position_x = data.get('position_x')
    position_y = data.get('position_y')

    if position_x is None or position_y is None:
        return jsonify({'error': 'Position coordinates are required'}), 400

    topic.update_topic_position(topic_id, position_x, position_y)
    return jsonify({'success': True})

@api.route('/topics/<int:topic_id>/dimensions', methods=['PUT'])
def update_topic_dimensions(topic_id):
    data = request.json
    grid_width = data.get('grid_width')
    grid_height = data.get('grid_height')

    if grid_width is None or grid_height is None:
        return jsonify({'error': 'Dimensions are required'}), 400

    # Enforce minimum size
    if grid_width < 5 or grid_height < 3:
        return jsonify({'error': 'Minimum size is 5x3'}), 400

    topic.update_topic_dimensions(topic_id, grid_width, grid_height)
    return jsonify({'success': True})

# Reference routes
@api.route('/topics/<int:topic_id>/references', methods=['GET'])
def get_references(topic_id):
    references = reference.get_references_by_topic(topic_id)
    return jsonify(references)

@api.route('/topics/<int:topic_id>/references', methods=['POST'])
def create_reference(topic_id):
    data = request.json
    reference_id = reference.create_reference(
        topic_id,
        data['title'],
        data.get('doi', ''),
        data.get('authors', ''),
        data.get('abstract', ''),
        data.get('notes', ''),
        data.get('citation_count', 0),
        data.get('publication_year', None),
        data.get('bibtex', '')
    )
    return jsonify({'id': reference_id}), 201

@api.route('/references/<int:reference_id>', methods=['PUT'])
def update_reference_route(reference_id):
    data = request.json
    reference.update_reference(
        reference_id,
        data.get('title'),
        data.get('doi', ''),
        data.get('authors', ''),
        data.get('abstract', ''),
        data.get('notes', ''),
        data.get('citation_count', 0),
        data.get('publication_year', None),
        data.get('bibtex', '')
    )
    return jsonify({'success': True})

@api.route('/references/<int:reference_id>', methods=['DELETE'])
def delete_reference_route(reference_id):
    reference.delete_reference(reference_id)
    return jsonify({'success': True})

@api.route('/references/<int:reference_id>/move', methods=['PUT'])
def move_reference_route(reference_id):
    data = request.json
    target_topic_id = data.get('target_topic_id')
    reference.move_reference(reference_id, target_topic_id)
    return jsonify({'success': True})

@api.route('/topics/<int:topic_id>/references/reorder', methods=['PUT'])
def reorder_references_route(topic_id):
    data = request.json
    reference_ids = data.get('reference_ids', [])
    reference.reorder_references(topic_id, reference_ids)
    return jsonify({'success': True})

@api.route('/references/<int:reference_id>/duplicate', methods=['POST'])
def duplicate_reference_route(reference_id):
    data = request.json
    target_topic_id = data.get('target_topic_id')
    new_reference_id = reference.duplicate_reference(reference_id, target_topic_id)
    return jsonify({'success': True, 'id': new_reference_id})


# ---------------- PDF attachment routes ----------------

@api.route('/references/<int:reference_id>/pdf', methods=['POST'])
def upload_reference_pdf(reference_id):
    """Attach (or replace) a PDF file for an existing reference."""
    ref = reference.get_reference_by_id(reference_id)
    if not ref:
        return jsonify({'error': 'Reference not found'}), 404

    if 'pdf' not in request.files:
        return jsonify({'error': 'No file uploaded (field "pdf" missing)'}), 400

    file = request.files['pdf']
    if not file or not file.filename:
        return jsonify({'error': 'Empty file'}), 400
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Only .pdf files are allowed'}), 400

    # Remove the previous PDF if present
    old_path = ref.get('pdf_path')
    if old_path:
        old_abs = _abs_pdf_path(old_path)
        if old_abs and os.path.exists(old_abs):
            try:
                os.remove(old_abs)
            except OSError:
                pass

    # Store under a unique filename, keyed by reference id
    unique_name = f'ref_{reference_id}_{uuid.uuid4().hex}.pdf'
    abs_target = os.path.join(PDF_STORAGE_DIR, unique_name)
    file.save(abs_target)

    reference.set_reference_pdf(reference_id, unique_name)
    return jsonify({'success': True, 'pdf_path': unique_name})


@api.route('/references/<int:reference_id>/pdf-view', methods=['GET'])
def get_reference_pdf_view(reference_id):
    """Tiny HTML wrapper around the PDF.

    Embedded viewers (Chromium <webview>) read the page <title> and emit it
    via the `page-title-updated` event. Serving the PDF inside an HTML page
    lets us control the title shown in the panel header — instead of the
    random ".tmp" name Chromium would otherwise use as document title for a
    raw PDF response.
    """
    import html as _html
    import json as _json
    from urllib.parse import quote

    ref = reference.get_reference_by_id(reference_id)
    if not ref or not ref.get('pdf_path'):
        return Response('<h1>PDF not found</h1>', status=404, mimetype='text/html')
    abs_path = _abs_pdf_path(ref['pdf_path'])
    if not abs_path or not os.path.exists(abs_path):
        return Response('<h1>PDF file missing on disk</h1>', status=404, mimetype='text/html')

    title = ref.get('title') or f'Reference {reference_id}'
    title_escaped = _html.escape(title, quote=True)
    # Safe JS-literal form (handles quotes, newlines, unicode) for inline
    # script. Replace "</" so a stray "</script>" inside a title can't break
    # out of the <script> block.
    title_js = _json.dumps(title).replace('</', '<\\/')

    # End the embedded PDF URL with "<title>.pdf" — Chromium's built-in PDF
    # viewer reads the trailing path segment to label its own toolbar (the
    # download button, save dialog, etc.). Without this it falls back to a
    # random "[hash].tmp" name from its disk cache.
    nice_name = _safe_segment(title, f'reference_{reference_id}')
    pdf_url = f'/api/references/{reference_id}/pdf/{quote(nice_name)}.pdf'

    # Notes:
    #  - The PDF lives inside an <iframe>, not <embed>. With <embed>, Chromium
    #    promotes the PDF viewer to control the top-level document title, and
    #    after the PDF loads it replaces our <title> with the cached ".tmp"
    #    name from its disk cache. Inside an <iframe> the top-level title
    #    stays under our control.
    #  - We also reassert document.title periodically — some Chromium builds
    #    still fire one late page-title-updated from the PDF subframe; this
    #    locks the title back to the reference title.
    page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title_escaped}</title>
<style>
  html, body {{ margin: 0; padding: 0; height: 100%; background: #525659; overflow: hidden; }}
  iframe {{ display: block; width: 100%; height: 100vh; border: 0; }}
</style>
</head>
<body>
<iframe src="{pdf_url}#toolbar=1&navpanes=0" title="{title_escaped}"></iframe>
<script>
  (function() {{
    var desired = {title_js};
    document.title = desired;
    // Re-assert the title in case the PDF subframe updates it after load.
    var ticks = 0;
    var iv = setInterval(function() {{
      if (document.title !== desired) document.title = desired;
      if (++ticks > 40) clearInterval(iv); // stop after ~10s
    }}, 250);
  }})();
</script>
</body>
</html>'''
    return Response(page, mimetype='text/html; charset=utf-8')


@api.route('/references/<int:reference_id>/pdf', methods=['GET'])
@api.route('/references/<int:reference_id>/pdf/<path:display_name>', methods=['GET'])
def get_reference_pdf(reference_id, display_name=None):
    """Stream the attached PDF (inline), named after the reference title.

    The optional <display_name> segment is ignored server-side but makes the
    URL end in a meaningful filename, so embedded PDF viewers (Chromium,
    Electron) show the reference title in the panel title instead of a
    random storage name.
    """
    from urllib.parse import quote

    ref = reference.get_reference_by_id(reference_id)
    if not ref or not ref.get('pdf_path'):
        return jsonify({'error': 'PDF not found'}), 404
    abs_path = _abs_pdf_path(ref['pdf_path'])
    if not abs_path or not os.path.exists(abs_path):
        return jsonify({'error': 'PDF file missing on disk'}), 404

    # Display filename = sanitized reference title
    nice_name = f'{_safe_segment(ref.get("title"), f"reference_{reference_id}")}.pdf'

    # Brand the PDF with /Title metadata so Chromium's viewer toolbar shows
    # the reference title instead of the cache-temp "[hash].tmp" filename.
    serve_path = _branded_pdf_path(reference_id, abs_path, ref.get('title'))

    response = send_file(
        serve_path,
        mimetype='application/pdf',
        as_attachment=False,
        download_name=nice_name,
    )

    # Force an explicit inline Content-Disposition with BOTH the ASCII and the
    # UTF-8 (RFC 5987) filename forms. Chromium's PDF viewer uses this header
    # to set the document title shown by host pages (and by Electron <webview>
    # via the page-title-updated event).
    ascii_name = nice_name.encode('ascii', 'replace').decode('ascii').replace('?', '_')
    response.headers['Content-Disposition'] = (
        f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(nice_name)}"
    )
    # Also expose it as a custom header in case any client prefers it.
    response.headers['X-Document-Title'] = ascii_name
    return response


@api.route('/references/<int:reference_id>/pdf', methods=['DELETE'])
def delete_reference_pdf(reference_id):
    """Remove the PDF attachment from a reference."""
    ref = reference.get_reference_by_id(reference_id)
    if not ref:
        return jsonify({'error': 'Reference not found'}), 404
    old_path = ref.get('pdf_path')
    if old_path:
        old_abs = _abs_pdf_path(old_path)
        if old_abs and os.path.exists(old_abs):
            try:
                os.remove(old_abs)
            except OSError:
                pass
    reference.set_reference_pdf(reference_id, None)
    return jsonify({'success': True})


@api.route('/topics/<int:topic_id>/references/with-pdf', methods=['POST'])
def create_reference_with_pdf(topic_id):
    """Create a reference and attach a PDF in a single multipart request.

    Expected multipart form fields:
      - pdf: the .pdf file (optional — if missing, no PDF is attached)
      - all reference fields as form fields (title, doi, authors, ...)
    """
    form = request.form
    title = form.get('title', '').strip()
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    def _to_int(value, default=None):
        try:
            return int(value) if value not in (None, '', 'null') else default
        except (TypeError, ValueError):
            return default

    reference_id = reference.create_reference(
        topic_id,
        title,
        form.get('doi', ''),
        form.get('authors', ''),
        form.get('abstract', ''),
        form.get('notes', ''),
        _to_int(form.get('citation_count'), 0) or 0,
        _to_int(form.get('publication_year'), None),
        form.get('bibtex', ''),
    )

    # Optional PDF
    file = request.files.get('pdf')
    if file and file.filename:
        if not file.filename.lower().endswith('.pdf'):
            return jsonify({'error': 'Only .pdf files are allowed', 'id': reference_id}), 400
        unique_name = f'ref_{reference_id}_{uuid.uuid4().hex}.pdf'
        abs_target = os.path.join(PDF_STORAGE_DIR, unique_name)
        file.save(abs_target)
        reference.set_reference_pdf(reference_id, unique_name)

    return jsonify({'id': reference_id}), 201


# ---------------- End PDF routes ----------------

# Paper search routes
@api.route('/search/papers', methods=['POST'])
def search_papers():
    data = request.json
    query = data.get('query', '')
    search_type = data.get('search_type', 'title')
    limit = data.get('limit', 10)

    if not query:
        return jsonify({'error': 'Query is required'}), 400

    results = paper_search.search_papers(query, search_type, limit)
    return jsonify(results)

@api.route('/paper/doi/<path:doi>', methods=['GET'])
def get_paper_by_doi(doi):
    paper = paper_search.get_paper_by_doi(doi)
    if paper:
        return jsonify(paper)
    return jsonify({'error': 'Paper not found'}), 404

# Reference connection routes
@api.route('/projects/<int:project_id>/connections', methods=['GET'])
def get_connections(project_id):
    connections = connection.get_connections_by_project(project_id)
    return jsonify(connections)

@api.route('/connections', methods=['POST'])
def create_connection_route():
    data = request.json
    connection_id = connection.create_connection(
        data['source_reference_id'],
        data['target_reference_id'],
        data.get('description', '')
    )
    return jsonify({'id': connection_id}), 201

@api.route('/connections/<int:connection_id>', methods=['PUT'])
def update_connection_route(connection_id):
    data = request.json
    connection.update_connection(connection_id, data.get('description', ''))
    return jsonify({'success': True})

@api.route('/connections/<int:connection_id>', methods=['DELETE'])
def delete_connection_route(connection_id):
    connection.delete_connection(connection_id)
    return jsonify({'success': True})

# Export bibliography
@api.route('/projects/<int:project_id>/export/bibliography', methods=['GET'])
def export_bibliography(project_id):
    """Export all BibTeX entries for a project"""
    try:
        # Get all topics for this project
        topics = topic.get_topics_by_project(project_id)

        # Collect all unique references by DOI or title
        unique_refs = {}
        for t in topics:
            if 'references' in t:
                for ref in t['references']:
                    # Use DOI as unique key if available, otherwise use title
                    key = ref.get('doi', '').strip().lower() if ref.get('doi', '').strip() else ref.get('title', '').strip().lower()
                    if key and ref.get('bibtex'):
                        unique_refs[key] = ref.get('bibtex')

        # Join all BibTeX entries
        bibliography = '\n\n'.join(unique_refs.values())

        return jsonify({
            'bibliography': bibliography,
            'count': len(unique_refs)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Export all attached PDFs as a ZIP, organized into folders by Topic
@api.route('/projects/<int:project_id>/export/pdfs', methods=['GET'])
def export_pdfs_zip(project_id):
    """Bundle every attached PDF in this project into a ZIP.

    Layout inside the zip:
        <Topic name>/<Reference title>.pdf
    Names are sanitized for filesystem safety; duplicate titles inside the same
    topic are disambiguated with a numeric suffix.
    """
    try:
        proj = project.get_project_by_id(project_id)
        if not proj:
            return jsonify({'error': 'Project not found'}), 404

        topics_data = topic.get_topics_by_project(project_id)

        buffer = io.BytesIO()
        included = 0
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for t in topics_data:
                topic_folder = _safe_segment(t.get('name'), 'Untitled topic')
                used_names = {}
                for ref in t.get('references', []):
                    pdf_rel = ref.get('pdf_path')
                    if not pdf_rel:
                        continue
                    abs_path = _abs_pdf_path(pdf_rel)
                    if not abs_path or not os.path.exists(abs_path):
                        continue

                    base = _safe_segment(ref.get('title'), f'reference_{ref.get("id")}')
                    # Truncate over-long names to keep the path manageable
                    if len(base) > 150:
                        base = base[:150].rstrip()

                    # Disambiguate duplicates within the same topic folder
                    count = used_names.get(base, 0)
                    if count == 0:
                        filename = f'{base}.pdf'
                    else:
                        filename = f'{base} ({count}).pdf'
                    used_names[base] = count + 1

                    arcname = f'{topic_folder}/{filename}'
                    zf.write(abs_path, arcname)
                    included += 1

        if included == 0:
            return jsonify({'error': 'No PDFs attached in this project'}), 404

        buffer.seek(0)
        zip_filename = f'{_safe_segment(proj["title"], "project")}_pdfs.zip'
        return Response(
            buffer.getvalue(),
            mimetype='application/zip',
            headers={
                'Content-Disposition': f'attachment; filename="{zip_filename}"',
                'X-PDF-Count': str(included),
            },
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Export report (references + notes + connections)
@api.route('/projects/<int:project_id>/export/report', methods=['GET'])
def export_report(project_id):
    """Export a structured report: references grouped by topic, with notes and connections"""
    try:
        proj = project.get_project_by_id(project_id)
        if not proj:
            return jsonify({'error': 'Project not found'}), 404

        topics_data = topic.get_topics_by_project(project_id)
        connections_data = connection.get_connections_by_project(project_id)

        # Build a lookup: ref id -> ref data (including topic name)
        ref_lookup = {}
        report_topics = []
        for t in topics_data:
            topic_refs = []
            for ref in t.get('references', []):
                ref_lookup[ref['id']] = {**ref, 'topic_name': t['name']}
                topic_refs.append({
                    'id': ref['id'],
                    'title': ref.get('title', ''),
                    'authors': ref.get('authors', ''),
                    'doi': ref.get('doi', ''),
                    'publication_year': ref.get('publication_year'),
                    'citation_count': ref.get('citation_count', 0),
                    'abstract': ref.get('abstract', ''),
                    'notes': ref.get('notes', ''),
                })
            report_topics.append({
                'name': t['name'],
                'color': t.get('color', '#007bff'),
                'references': topic_refs,
            })

        # Build connections with readable titles
        report_connections = []
        for conn in connections_data:
            src = ref_lookup.get(conn['source_reference_id'])
            tgt = ref_lookup.get(conn['target_reference_id'])
            if src and tgt:
                report_connections.append({
                    'source_title': src['title'],
                    'source_topic': src['topic_name'],
                    'target_title': tgt['title'],
                    'target_topic': tgt['topic_name'],
                    'description': conn.get('description', ''),
                })

        return jsonify({
            'project_title': proj['title'],
            'topics': report_topics,
            'connections': report_connections,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

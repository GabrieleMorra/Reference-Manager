from flask import Blueprint, request, jsonify
from models import project, topic, reference, connection
from services import paper_search

api = Blueprint('api', __name__)

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
        data.get('publication_year', None)
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
        data.get('publication_year', None)
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

@api.route('/references/<int:reference_id>/duplicate', methods=['POST'])
def duplicate_reference_route(reference_id):
    data = request.json
    target_topic_id = data.get('target_topic_id')
    new_reference_id = reference.duplicate_reference(reference_id, target_topic_id)
    return jsonify({'success': True, 'id': new_reference_id})

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

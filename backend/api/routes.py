from flask import Blueprint, request, jsonify
from models import project, topic, reference

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
        data.get('position_y', 0)
    )
    return jsonify({'id': topic_id}), 201

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
        data.get('notes', '')
    )
    return jsonify({'id': reference_id}), 201

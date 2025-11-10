import { useState } from 'react';
import './ProjectList.css';

function ProjectList({ projects, onSelectProject, onProjectsChange }) {
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateProject = async () => {
    if (!newProjectTitle.trim()) return;

    try {
      const response = await fetch('http://localhost:5000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newProjectTitle }),
      });

      if (response.ok) {
        setNewProjectTitle('');
        setIsCreating(false);
        onProjectsChange();
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  return (
    <div className="project-list">
      <div className="project-list-header">
        <h1>Reference Manager</h1>
        <button onClick={() => setIsCreating(true)}>+ New Project</button>
      </div>

      {isCreating && (
        <div className="new-project-form">
          <input
            type="text"
            placeholder="Project title..."
            value={newProjectTitle}
            onChange={(e) => setNewProjectTitle(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateProject()}
            autoFocus
          />
          <button onClick={handleCreateProject}>Create</button>
          <button onClick={() => setIsCreating(false)}>Cancel</button>
        </div>
      )}

      <div className="projects-grid">
        {projects.map((project) => (
          <div
            key={project.id}
            className="project-card"
            onClick={() => onSelectProject(project)}
          >
            <h3>{project.title}</h3>
            <p className="project-date">
              {new Date(project.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProjectList;

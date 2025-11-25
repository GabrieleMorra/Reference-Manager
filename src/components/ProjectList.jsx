import { useState, useEffect } from 'react';
import './ProjectList.css';

function ProjectList({ projects, onSelectProject, onProjectsChange }) {
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [renamingProjectId, setRenamingProjectId] = useState(null);
  const [renameTitle, setRenameTitle] = useState('');

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (openMenuId !== null && !e.target.closest('.project-menu')) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openMenuId]);

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

  const handleRename = (project) => {
    setRenamingProjectId(project.id);
    setRenameTitle(project.title);
    setOpenMenuId(null);
  };

  const handleRenameSubmit = async (projectId) => {
    if (!renameTitle.trim()) return;

    try {
      const response = await fetch(`http://localhost:5000/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: renameTitle }),
      });

      if (response.ok) {
        setRenamingProjectId(null);
        setRenameTitle('');
        onProjectsChange();
      }
    } catch (error) {
      console.error('Failed to rename project:', error);
    }
  };

  const handleDelete = async (projectId, projectTitle) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${projectTitle}"?\n\nThis will permanently delete all topics and references in this project.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`http://localhost:5000/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setOpenMenuId(null);
        onProjectsChange();
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const toggleMenu = (e, projectId) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === projectId ? null : projectId);
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
            onClick={() => renamingProjectId !== project.id && onSelectProject(project)}
          >
            <div className="project-menu">
              <button
                className="menu-button"
                onClick={(e) => toggleMenu(e, project.id)}
              >
                ⋮
              </button>
              {openMenuId === project.id && (
                <div className="menu-dropdown">
                  <button onClick={(e) => { e.stopPropagation(); handleRename(project); }}>
                    Rename
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(project.id, project.title); }}>
                    Delete
                  </button>
                </div>
              )}
            </div>

            {renamingProjectId === project.id ? (
              <div className="rename-form" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit(project.id);
                    if (e.key === 'Escape') setRenamingProjectId(null);
                  }}
                  autoFocus
                />
                <div className="rename-buttons">
                  <button onClick={() => handleRenameSubmit(project.id)}>Save</button>
                  <button onClick={() => setRenamingProjectId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <h3>{project.title}</h3>
                <p className="project-date">
                  {new Date(project.created_at).toLocaleDateString()}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProjectList;

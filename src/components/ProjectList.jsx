import { useState, useEffect } from 'react';
import './ProjectList.css';

function ProjectList({ projects, onSelectProject, onProjectsChange }) {
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [renamingProjectId, setRenamingProjectId] = useState(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date');

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

  // Listen for create-project event from top bar
  useEffect(() => {
    const handler = () => setIsCreating(true);
    document.addEventListener('create-project', handler);
    return () => document.removeEventListener('create-project', handler);
  }, []);

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

  // Filter and sort projects
  const filteredProjects = projects
    .filter((project) =>
      project.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.title.localeCompare(b.title);
        case 'date':
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });

  return (
    <div className="project-list">
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

      <div className="project-controls">
        <div className="project-search">
          <span className="search-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="project-sort">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date">Newest first</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>
      </div>

      {filteredProjects.length === 0 && projects.length === 0 ? (
        <div className="project-empty-state">
          <div className="empty-icon">&#128218;</div>
          <h3>No projects yet</h3>
          <p>Create your first project to start organizing your references.</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="project-empty-state">
          <h3>No matching projects</h3>
          <p>Try a different search term.</p>
        </div>
      ) : (
        <div className="projects-grid">
          {filteredProjects.map((project, index) => (
            <div
              key={project.id}
              className="project-card"
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => renamingProjectId !== project.id && onSelectProject(project)}
            >
              <div className="project-menu">
                <button
                  className="menu-button"
                  onClick={(e) => toggleMenu(e, project.id)}
                >
                  &#8942;
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
      )}
    </div>
  );
}

export default ProjectList;

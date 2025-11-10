import { useState, useEffect } from 'react';
import ProjectList from './components/ProjectList';
import ProjectView from './components/ProjectView';
import './App.css';

function App() {
  const [currentProject, setCurrentProject] = useState(null);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/projects');
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleSelectProject = (project) => {
    setCurrentProject(project);
  };

  const handleBackToProjects = () => {
    setCurrentProject(null);
    loadProjects();
  };

  return (
    <div className="app">
      {currentProject ? (
        <ProjectView
          project={currentProject}
          onBack={handleBackToProjects}
        />
      ) : (
        <ProjectList
          projects={projects}
          onSelectProject={handleSelectProject}
          onProjectsChange={loadProjects}
        />
      )}
    </div>
  );
}

export default App;

import { useState, useEffect } from 'react';
import ProjectList from './components/ProjectList';
import ProjectView from './components/ProjectView';
import WebPanel from './components/WebPanel';
import './App.css';

function App() {
  const [currentProject, setCurrentProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [webPanelUrl, setWebPanelUrl] = useState(null);
  const [isAddingTopic, setIsAddingTopic] = useState(false);

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
    setIsAddingTopic(false); // Reset add topic state when switching projects
  };

  const handleBackToProjects = () => {
    setCurrentProject(null);
    setIsAddingTopic(false); // Reset add topic state when going back
    loadProjects();
  };

  const handleOpenWebPanel = (url) => {
    setWebPanelUrl(url);
  };

  const handleCloseWebPanel = () => {
    setWebPanelUrl(null);
  };

  const handleAddTopicStateChange = (isAdding) => {
    setIsAddingTopic(isAdding);
  };

  return (
    <div className="app">
      <div className={`main-content ${webPanelUrl ? 'with-panel' : ''}`}>
        {currentProject ? (
          <ProjectView
            project={currentProject}
            onBack={handleBackToProjects}
            onOpenWebPanel={handleOpenWebPanel}
            isPanelOpen={!!webPanelUrl}
            onAddTopicStateChange={handleAddTopicStateChange}
          />
        ) : (
          <ProjectList
            projects={projects}
            onSelectProject={handleSelectProject}
            onProjectsChange={loadProjects}
          />
        )}
      </div>
      <WebPanel url={webPanelUrl} onClose={handleCloseWebPanel} isAddingTopic={isAddingTopic} />
    </div>
  );
}

export default App;

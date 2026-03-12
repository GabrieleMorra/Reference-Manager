import { useState, useEffect, useRef } from 'react';
import ProjectList from './components/ProjectList';
import ProjectView from './components/ProjectView';
import WebPanel from './components/WebPanel';
import ExportReportModal from './components/ExportReportModal';
import './App.css';

function App() {
  const [currentProject, setCurrentProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [webPanelUrl, setWebPanelUrl] = useState(null);
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [webPanelHidden, setWebPanelHidden] = useState(false);
  const webPanelRef = useRef(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!showExportMenu) return;
    const close = (e) => {
      if (!e.target.closest('.export-dropdown-wrap')) setShowExportMenu(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showExportMenu]);

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
    setIsAddingTopic(false);
  };

  const handleBackToProjects = () => {
    setCurrentProject(null);
    setIsAddingTopic(false);
    loadProjects();
  };

  const handleOpenWebPanel = (url) => {
    setWebPanelUrl(url);
    setWebPanelHidden(false);
  };

  const handleCloseWebPanel = () => {
    setWebPanelUrl(null);
    setWebPanelHidden(false);
  };

  const handleSetWebPanelHidden = (hidden) => {
    setWebPanelHidden(hidden);
  };

  const fetchAllReferences = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/projects/${currentProject.id}/topics`);
      const topics = await response.json();
      const refs = [];
      topics.forEach(t => {
        if (t.references) refs.push(...t.references);
      });
      return refs;
    } catch (error) {
      console.error('Failed to fetch references:', error);
      return [];
    }
  };

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const safeFilename = (title) => title.replace(/[^a-z0-9]/gi, '_');

  const handleExportCSV = async () => {
    if (!currentProject) return;
    setShowExportMenu(false);
    const refs = await fetchAllReferences();
    if (refs.length === 0) { alert('No references to export'); return; }
    const escapeCsv = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    const header = 'Title,Authors,Year,DOI,Notes,Citation Count';
    const rows = refs.map(r => [
      escapeCsv(r.title), escapeCsv(r.authors), r.publication_year || '', escapeCsv(r.doi), escapeCsv(r.notes), r.citation_count || 0
    ].join(','));
    downloadFile([header, ...rows].join('\n'), `${safeFilename(currentProject.title)}_references.csv`, 'text/csv');
  };

  const handleExportMarkdown = async () => {
    if (!currentProject) return;
    setShowExportMenu(false);
    const refs = await fetchAllReferences();
    if (refs.length === 0) { alert('No references to export'); return; }
    const lines = [`# ${currentProject.title} - References\n`];
    refs.forEach((r, i) => {
      lines.push(`${i + 1}. **${r.title}**`);
      if (r.authors) lines.push(`   - Authors: ${r.authors}`);
      if (r.publication_year) lines.push(`   - Year: ${r.publication_year}`);
      if (r.doi) lines.push(`   - DOI: ${r.doi}`);
      if (r.citation_count) lines.push(`   - Citations: ${r.citation_count}`);
      if (r.notes) lines.push(`   - Notes: ${r.notes}`);
      lines.push('');
    });
    downloadFile(lines.join('\n'), `${safeFilename(currentProject.title)}_references.md`, 'text/markdown');
  };

  const handleExportBibliography = async () => {
    if (!currentProject) return;
    try {
      const response = await fetch(`http://localhost:5000/api/projects/${currentProject.id}/export/bibliography`);
      const data = await response.json();

      if (data.bibliography) {
        const blob = new Blob([data.bibliography], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentProject.title.replace(/[^a-z0-9]/gi, '_')}_bibliography.bib`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        alert(`Exported ${data.count} unique BibTeX entries`);
      } else {
        alert('No BibTeX entries found in this project');
      }
    } catch (error) {
      console.error('Failed to export bibliography:', error);
      alert('Failed to export bibliography');
    }
    setShowExportMenu(false);
  };

  return (
    <div className="app">
      {/* Persistent Top Bar */}
      <div className="top-bar">
        <div className="top-bar-left">
          <nav className="breadcrumb">
            {currentProject ? (
              <>
                <button className="breadcrumb-link" onClick={handleBackToProjects}>Projects</button>
                <span className="breadcrumb-sep">/</span>
                <span className="breadcrumb-current">{currentProject.title}</span>
              </>
            ) : (
              <span className="breadcrumb-current">Projects</span>
            )}
          </nav>
        </div>
        <div className="top-bar-actions">
          {currentProject ? (
            <>
              <button onClick={() => handleOpenWebPanel('https://scholar.google.com')}>Google Scholar</button>
              <div className="export-dropdown-wrap">
                <button className="btn-success" onClick={() => setShowExportMenu(prev => !prev)}>Export &#9662;</button>
                {showExportMenu && (
                  <div className="export-dropdown-menu">
                    <button onClick={handleExportBibliography}>BibTeX (.bib)</button>
                    <button onClick={handleExportCSV}>CSV (.csv)</button>
                    <button onClick={handleExportMarkdown}>Markdown (.md)</button>
                    <button onClick={() => { setShowExportMenu(false); setShowReportModal(true); }}>Report</button>
                  </div>
                )}
              </div>
              <button onClick={() => setIsAddingTopic(true)}>+ Add Topic</button>
            </>
          ) : (
            <button onClick={() => document.dispatchEvent(new CustomEvent('create-project'))}>+ New Project</button>
          )}
        </div>
      </div>

      {/* App Body */}
      <div className="app-body">
        <div className={`main-content ${webPanelUrl && !webPanelHidden ? 'with-panel' : ''}`}>
          {currentProject ? (
            <ProjectView
              project={currentProject}
              onOpenWebPanel={handleOpenWebPanel}
              onCloseWebPanel={handleCloseWebPanel}
              isPanelOpen={!!webPanelUrl && !webPanelHidden}
              webPanelRef={webPanelRef}
              isAddingTopic={isAddingTopic}
              onSetIsAddingTopic={setIsAddingTopic}
              webPanelHidden={webPanelHidden}
              onSetWebPanelHidden={handleSetWebPanelHidden}
            />
          ) : (
            <ProjectList
              projects={projects}
              onSelectProject={handleSelectProject}
              onProjectsChange={loadProjects}
            />
          )}
        </div>
        <WebPanel ref={webPanelRef} url={webPanelUrl} onClose={handleCloseWebPanel} isAddingTopic={isAddingTopic} hidden={webPanelHidden} />
      </div>

      {showReportModal && currentProject && (
        <ExportReportModal
          projectId={currentProject.id}
          projectTitle={currentProject.title}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}

export default App;

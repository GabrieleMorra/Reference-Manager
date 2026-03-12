import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ExportReportModal.css';

function ExportReportModal({ projectId, projectTitle, onClose }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [format, setFormat] = useState('markdown');

  useEffect(() => {
    loadReport();
  }, [projectId]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`http://localhost:5000/api/projects/${projectId}/export/report`);
      if (!response.ok) throw new Error('Failed to load report');
      const data = await response.json();
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateMarkdown = () => {
    if (!report) return '';
    const lines = [`# ${report.project_title} - Report\n`];

    report.topics.forEach((topic) => {
      if (topic.references.length === 0) return;
      lines.push(`## ${topic.name}\n`);
      topic.references.forEach((ref, i) => {
        lines.push(`### ${i + 1}. ${ref.title}`);
        if (ref.authors) lines.push(`**Authors:** ${ref.authors}`);
        const meta = [];
        if (ref.publication_year) meta.push(`Year: ${ref.publication_year}`);
        if (ref.citation_count) meta.push(`Citations: ${ref.citation_count}`);
        if (ref.doi) meta.push(`DOI: ${ref.doi}`);
        if (meta.length) lines.push(meta.join(' | '));
        if (ref.notes) lines.push(`\n> ${ref.notes.replace(/\n/g, '\n> ')}`);
        lines.push('');
      });
    });

    if (report.connections.length > 0) {
      lines.push(`## Connections\n`);
      report.connections.forEach((conn) => {
        const label = conn.description ? ` - ${conn.description}` : '';
        lines.push(`- **${conn.source_title}** (${conn.source_topic}) → **${conn.target_title}** (${conn.target_topic})${label}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  };

  const generatePlainText = () => {
    if (!report) return '';
    const lines = [`${report.project_title} - Report`, '='.repeat(50), ''];

    report.topics.forEach((topic) => {
      if (topic.references.length === 0) return;
      lines.push(topic.name);
      lines.push('-'.repeat(topic.name.length));
      lines.push('');
      topic.references.forEach((ref, i) => {
        lines.push(`  ${i + 1}. ${ref.title}`);
        if (ref.authors) lines.push(`     Authors: ${ref.authors}`);
        if (ref.publication_year) lines.push(`     Year: ${ref.publication_year}`);
        if (ref.citation_count) lines.push(`     Citations: ${ref.citation_count}`);
        if (ref.doi) lines.push(`     DOI: ${ref.doi}`);
        if (ref.notes) lines.push(`     Notes: ${ref.notes}`);
        lines.push('');
      });
    });

    if (report.connections.length > 0) {
      lines.push('Connections');
      lines.push('-'.repeat(11));
      lines.push('');
      report.connections.forEach((conn) => {
        const label = conn.description ? ` -- ${conn.description}` : '';
        lines.push(`  ${conn.source_title} (${conn.source_topic}) -> ${conn.target_title} (${conn.target_topic})${label}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  };

  const getPreviewContent = () => {
    return format === 'markdown' ? generateMarkdown() : generatePlainText();
  };

  const handleDownload = () => {
    const content = getPreviewContent();
    const ext = format === 'markdown' ? 'md' : 'txt';
    const mimeType = format === 'markdown' ? 'text/markdown' : 'text/plain';
    const filename = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}_report.${ext}`;

    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = async () => {
    const content = getPreviewContent();
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  const totalRefs = report ? report.topics.reduce((sum, t) => sum + t.references.length, 0) : 0;
  const totalConns = report ? report.connections.length : 0;

  return createPortal(
    <div className="export-report-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="export-report-modal">
        <div className="export-report-header">
          <div className="export-report-header-left">
            <h3>Export Report</h3>
            {report && (
              <span className="export-report-stats">
                {totalRefs} references, {totalConns} connections
              </span>
            )}
          </div>
          <button className="export-report-close" onClick={onClose}>&times;</button>
        </div>

        <div className="export-report-toolbar">
          <div className="export-format-toggle">
            <button
              className={`format-btn ${format === 'markdown' ? 'active' : ''}`}
              onClick={() => setFormat('markdown')}
            >
              Markdown
            </button>
            <button
              className={`format-btn ${format === 'text' ? 'active' : ''}`}
              onClick={() => setFormat('text')}
            >
              Plain Text
            </button>
          </div>
          <div className="export-report-actions">
            <button className="export-action-btn copy" onClick={handleCopyToClipboard} disabled={!report}>
              Copy
            </button>
            <button className="export-action-btn download" onClick={handleDownload} disabled={!report}>
              Download
            </button>
          </div>
        </div>

        <div className="export-report-preview">
          {loading && <div className="export-report-loading">Loading report...</div>}
          {error && <div className="export-report-error">Error: {error}</div>}
          {report && !loading && (
            <pre className="export-report-content">{getPreviewContent()}</pre>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ExportReportModal;

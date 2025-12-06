import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ReferenceNode.css';

// Helper function to darken a color
const darkenColor = (color, percent) => {
  const num = parseInt(color.replace("#",""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) - amt;
  const G = (num >> 8 & 0x00FF) - amt;
  const B = (num & 0x0000FF) - amt;
  return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (G<255?G<1?0:G:255)*0x100 + (B<255?B<1?0:B:255)).toString(16).slice(1);
};

function ReferenceNode({ reference, onUpdate, onUpdateAll, currentTopicId, projectId, isPanelOpen, topicColor = '#007bff', onConnectionStart, onConnectionEnd, isConnecting }) {
  const borderColor = darkenColor(topicColor, 20);
  const [showDetails, setShowDetails] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ position: 'bottom', top: 0, left: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [availableTopics, setAvailableTopics] = useState([]);
  const [formData, setFormData] = useState({
    title: reference.title,
    doi: reference.doi || '',
    authors: reference.authors || '',
    abstract: reference.abstract || '',
    notes: reference.notes || '',
    citation_count: reference.citation_count || 0,
    publication_year: reference.publication_year || null,
    bibtex: reference.bibtex || '',
  });
  const nodeRef = useRef(null);
  const tooltipRef = useRef(null);
  const contextMenuRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const connectionStartTimeoutRef = useRef(null);

  useEffect(() => {
    // Load available topics when context menu is shown
    if (showContextMenu && projectId) {
      loadTopics();
    }
  }, [showContextMenu, projectId]);

  useEffect(() => {
    // Close context menu when clicking outside
    const handleClickOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showContextMenu]);

  useEffect(() => {
    // Adjust context menu position to keep it within viewport
    if (showContextMenu && contextMenuRef.current) {
      const menu = contextMenuRef.current;
      const menuRect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = contextMenuPosition.x;
      let newY = contextMenuPosition.y;

      // Check if menu goes beyond bottom edge - if so, position it ABOVE the click point
      if (newY + menuRect.height > viewportHeight - 10) {
        // Position menu so its bottom edge is at the click point
        newY = contextMenuPosition.y - menuRect.height;
      }

      // Check if menu goes beyond top edge after repositioning
      if (newY < 10) {
        newY = 10;
      }

      // Check if menu goes beyond right edge
      if (newX + menuRect.width > viewportWidth - 10) {
        newX = viewportWidth - menuRect.width - 10;
      }

      // Check if menu goes beyond left edge
      if (newX < 10) {
        newX = 10;
      }

      // Update position if it changed
      if (newX !== contextMenuPosition.x || newY !== contextMenuPosition.y) {
        setContextMenuPosition({ x: newX, y: newY });
      }
    }
  }, [showContextMenu]);

  useEffect(() => {
    if (showTooltip && nodeRef.current && tooltipRef.current) {
      const nodeRect = nodeRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 15;

      let top = 0;
      let left = 0;
      let position = 'bottom'; // default

      // Check vertical position
      const spaceBelow = viewportHeight - nodeRect.bottom - margin;
      const spaceAbove = nodeRect.top - margin;

      // Prefer bottom, but switch to top if not enough space below
      if (spaceBelow < tooltipRect.height + 20 && spaceAbove > tooltipRect.height + 20) {
        position = 'top';
        top = nodeRect.top - tooltipRect.height - 10;
      } else {
        position = 'bottom';
        top = nodeRect.bottom + 10;
      }

      // Check horizontal alignment - prefer center
      const nodeCenter = nodeRect.left + nodeRect.width / 2;
      const tooltipHalfWidth = tooltipRect.width / 2;

      if (nodeCenter - tooltipHalfWidth < margin) {
        // Not enough space on left, align to left edge
        left = nodeRect.left;
      } else if (nodeCenter + tooltipHalfWidth > viewportWidth - margin) {
        // Not enough space on right, align to right edge
        left = nodeRect.right - tooltipRect.width;
      } else {
        // Enough space, center it
        left = nodeCenter - tooltipHalfWidth;
      }

      setTooltipPosition({ position, top, left });
    }
  }, [showTooltip]);

  const loadTopics = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/projects/${projectId}/topics`);
      const data = await response.json();
      // Filter out the current topic
      setAvailableTopics(data.filter(topic => topic.id !== currentTopicId));
    } catch (error) {
      console.error('Failed to load topics:', error);
    }
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowTooltip(false); // Hide tooltip when showing context menu
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleMoveToTopic = async (targetTopicId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/references/${reference.id}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_topic_id: targetTopicId }),
      });

      if (response.ok) {
        setShowContextMenu(false);
        // Update all topics to reflect the move
        if (onUpdateAll) {
          onUpdateAll();
        } else {
          onUpdate();
        }
      }
    } catch (error) {
      console.error('Failed to move reference:', error);
    }
  };

  const handleDuplicateToTopic = async (targetTopicId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/references/${reference.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_topic_id: targetTopicId }),
      });

      if (response.ok) {
        setShowContextMenu(false);
        // Update all topics to reflect the duplication
        if (onUpdateAll) {
          onUpdateAll();
        } else {
          onUpdate();
        }
      }
    } catch (error) {
      console.error('Failed to duplicate reference:', error);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${reference.title}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`http://localhost:5000/api/references/${reference.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setShowDetails(false);
        onUpdate();
        if (onUpdateAll) {
          onUpdateAll(); // Update parent ProjectView to refresh citation count
        }
      }
    } catch (error) {
      console.error('Failed to delete reference:', error);
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.publication_year) {
      alert('Title and Publication Year are required');
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/references/${reference.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsEditing(false);
        setShowDetails(false);
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to update reference:', error);
    }
  };

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormData({
      title: reference.title,
      doi: reference.doi || '',
      authors: reference.authors || '',
      abstract: reference.abstract || '',
      notes: reference.notes || '',
      citation_count: reference.citation_count || 0,
      publication_year: reference.publication_year || null,
    });
  };

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (!showContextMenu) {
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 100);
  };

  const handleTooltipMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleTooltipMouseLeave = () => {
    setShowTooltip(false);
  };

  const handleCloseModal = () => {
    // If editing, cancel the edit and restore original data
    if (isEditing) {
      handleCancelEdit();
    }
    setShowDetails(false);
  };

  const handleMouseDown = (e) => {
    if (e.button === 0 && onConnectionStart) {  // Left mouse button
      e.stopPropagation();
      e.preventDefault();

      // Start connection only after 150ms (long press)
      connectionStartTimeoutRef.current = setTimeout(() => {
        setShowTooltip(false);  // Hide tooltip when starting connection
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
        onConnectionStart(reference.id, nodeRef.current);
      }, 150);
    }
  };

  const handleMouseUp = (e) => {
    // Cancel connection start if mouse is released before 150ms
    if (connectionStartTimeoutRef.current) {
      clearTimeout(connectionStartTimeoutRef.current);
      connectionStartTimeoutRef.current = null;
    }

    if (e.button === 0 && onConnectionEnd && isConnecting) {  // Left mouse button
      e.stopPropagation();
      e.preventDefault();
      onConnectionEnd(reference.id);
    }
  };

  const handleClick = (e) => {
    if (!isConnecting) {
      setShowDetails(true);
    }
  };

  return (
    <>
      <div
        ref={nodeRef}
        className={`reference-node ${isConnecting ? 'connecting' : ''}`}
        style={{
          borderColor: borderColor,
          '--hover-bg-color': topicColor
        }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
      </div>

      {showTooltip && createPortal(
        <div
          ref={tooltipRef}
          className="reference-tooltip"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <div className="tooltip-title">{reference.title}</div>

          {reference.authors && (
            <div className="tooltip-field">
              <label>Authors:</label>
              <span>{reference.authors}</span>
            </div>
          )}

          {reference.publication_year && (
            <div className="tooltip-field">
              <label>Year:</label>
              <span>{reference.publication_year}</span>
            </div>
          )}

          {reference.citation_count !== undefined && reference.citation_count !== null && (
            <div className="tooltip-field">
              <label>Citations:</label>
              <span>{reference.citation_count}</span>
            </div>
          )}

          {reference.doi && (
            <div className="tooltip-field">
              <label>DOI:</label>
              <a
                href={reference.doi}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {reference.doi}
              </a>
            </div>
          )}

          {reference.abstract && (
            <div className="tooltip-abstract">
              <strong>Abstract:</strong> {reference.abstract}
            </div>
          )}

          {reference.notes && (
            <div className="tooltip-abstract">
              <strong>Notes:</strong> {reference.notes}
            </div>
          )}
        </div>,
        document.body
      )}

      {showContextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenuPosition.x}px`,
            top: `${contextMenuPosition.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-section">
            <div className="context-menu-header">Sposta in...</div>
            {availableTopics.length > 0 ? (
              availableTopics.map((topic) => (
                <button
                  key={topic.id}
                  className="context-menu-item"
                  onClick={() => handleMoveToTopic(topic.id)}
                >
                  {topic.name}
                </button>
              ))
            ) : (
              <div className="context-menu-empty">Nessun altro argomento disponibile</div>
            )}
          </div>
          <div className="context-menu-divider"></div>
          <div className="context-menu-section">
            <div className="context-menu-header">Duplica in...</div>
            {availableTopics.length > 0 ? (
              availableTopics.map((topic) => (
                <button
                  key={topic.id}
                  className="context-menu-item"
                  onClick={() => handleDuplicateToTopic(topic.id)}
                >
                  {topic.name}
                </button>
              ))
            ) : (
              <div className="context-menu-empty">Nessun altro argomento disponibile</div>
            )}
          </div>
          <div className="context-menu-divider"></div>
          <div className="context-menu-section">
            <button
              className="context-menu-item"
              onClick={() => {
                setShowContextMenu(false);
                setShowDetails(true);
                setIsEditing(true);
              }}
            >
              Modifica
            </button>
            <button
              className="context-menu-item context-menu-delete"
              onClick={() => {
                setShowContextMenu(false);
                handleDelete();
              }}
            >
              Elimina
            </button>
          </div>
        </div>,
        document.body
      )}

      {showDetails && createPortal(
        <div className="reference-modal-overlay" onClick={handleCloseModal}>
          <div className={`reference-modal ${isPanelOpen ? 'with-panel' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{isEditing ? 'Edit Reference' : reference.title}</h3>
              <div className="modal-header-actions">
                {!isEditing && (
                  <button className="delete-btn" onClick={handleDelete} title="Delete reference">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 6h18v2H3V6zm2 3h14l-1 14H6L5 9zm5-6h4v2h-4V3z"/>
                    </svg>
                  </button>
                )}
                <button className="close-modal-btn" onClick={handleCloseModal}>×</button>
              </div>
            </div>

            <div className="modal-content">
              {isEditing ? (
                <>
                  <div className="field">
                    <label>Title *</label>
                    <textarea
                      className="title-textarea"
                      value={formData.title}
                      onChange={(e) => handleChange('title', e.target.value)}
                      rows="2"
                    />
                  </div>

                  <div className="field">
                    <label>DOI</label>
                    <input
                      type="text"
                      value={formData.doi}
                      onChange={(e) => handleChange('doi', e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label>Authors</label>
                    <input
                      type="text"
                      value={formData.authors}
                      onChange={(e) => handleChange('authors', e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label>Publication Year *</label>
                    <input
                      type="number"
                      value={formData.publication_year || ''}
                      onChange={(e) => handleChange('publication_year', e.target.value ? parseInt(e.target.value) : null)}
                      min="1900"
                      max={new Date().getFullYear()}
                    />
                  </div>

                  <div className="field">
                    <label>Citation Count</label>
                    <input
                      type="number"
                      value={formData.citation_count}
                      onChange={(e) => handleChange('citation_count', parseInt(e.target.value) || 0)}
                      min="0"
                    />
                  </div>

                  <div className="field">
                    <label>Abstract</label>
                    <textarea
                      value={formData.abstract}
                      onChange={(e) => handleChange('abstract', e.target.value)}
                      rows="4"
                    />
                  </div>

                  <div className="field">
                    <label>Personal Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => handleChange('notes', e.target.value)}
                      rows="3"
                    />
                  </div>

                  <div className="field">
                    <label>BibTeX Citation</label>
                    <textarea
                      value={formData.bibtex}
                      onChange={(e) => handleChange('bibtex', e.target.value)}
                      rows="4"
                      style={{ fontFamily: 'monospace', fontSize: '0.9em' }}
                    />
                  </div>

                  <div className="modal-actions">
                    <button className="save-btn" onClick={handleSave}>Save Changes</button>
                    <button className="cancel-btn" onClick={handleCancelEdit}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  {reference.authors && (
                    <div className="field">
                      <label>Authors</label>
                      <p>{reference.authors}</p>
                    </div>
                  )}

                  {reference.publication_year && (
                    <div className="field">
                      <label>Publication Year</label>
                      <p>{reference.publication_year}</p>
                    </div>
                  )}

                  {reference.citation_count !== undefined && reference.citation_count !== null && (
                    <div className="field">
                      <label>Citations</label>
                      <p>{reference.citation_count}</p>
                    </div>
                  )}

                  {reference.doi && (
                    <div className="field">
                      <label>DOI</label>
                      <p>
                        <a
                          href={reference.doi}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {reference.doi}
                        </a>
                      </p>
                    </div>
                  )}

                  {reference.abstract && (
                    <div className="field">
                      <label>Abstract</label>
                      <p>{reference.abstract}</p>
                    </div>
                  )}

                  {reference.notes && (
                    <div className="field">
                      <label>Personal Notes</label>
                      <p>{reference.notes}</p>
                    </div>
                  )}

                  {reference.bibtex && (
                    <div className="field">
                      <label>BibTeX Citation</label>
                      <pre style={{
                        fontFamily: 'monospace',
                        fontSize: '0.85em',
                        whiteSpace: 'pre-wrap',
                        backgroundColor: '#f5f5f5',
                        padding: '10px',
                        borderRadius: '4px',
                        overflow: 'auto'
                      }}>{reference.bibtex}</pre>
                    </div>
                  )}

                  <div className="modal-actions">
                    <button className="edit-btn" onClick={handleEdit}>Edit</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default ReferenceNode;

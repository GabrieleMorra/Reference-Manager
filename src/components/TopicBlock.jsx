import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReferenceNode from './ReferenceNode';
import './TopicBlock.css';

function TopicBlock({ topic, onUpdate, onOpenWebPanel, isPanelOpen, onConnectionStart, onConnectionEnd, isConnecting, onPositionChange }) {
  const [references, setReferences] = useState([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAddingReference, setIsAddingReference] = useState(false);
  const [openMenu, setOpenMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState(topic.name);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: topic.position_x, y: topic.position_y });
  const dragRef = useRef({ startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
  const blockRef = useRef(null);

  useEffect(() => {
    // Load references immediately on mount
    loadReferences();
  }, [topic.id]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (openMenu && !e.target.closest('.topic-menu')) {
        setOpenMenu(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openMenu]);

  const loadReferences = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/topics/${topic.id}/references`);
      const data = await response.json();
      setReferences(data);
    } catch (error) {
      console.error('Failed to load references:', error);
    }
  };

  const handleAddReference = () => {
    setIsAddingReference(true);
  };

  const handleReferenceAdded = () => {
    setIsAddingReference(false);
    loadReferences();
  };

  const toggleMenu = (e) => {
    e.stopPropagation();
    setOpenMenu(!openMenu);
  };

  const handleRename = () => {
    setIsRenaming(true);
    setRenameName(topic.name);
    setOpenMenu(false);
  };

  const handleRenameSubmit = async () => {
    if (!renameName.trim()) return;

    try {
      const response = await fetch(`http://localhost:5000/api/topics/${topic.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameName }),
      });

      if (response.ok) {
        setIsRenaming(false);
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to rename topic:', error);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${topic.name}"?\n\nThis will permanently delete all references in this topic.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`http://localhost:5000/api/topics/${topic.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setOpenMenu(false);
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to delete topic:', error);
    }
  };

  const handleMouseDown = (e) => {
    // Don't drag if clicking on buttons, inputs, or other interactive elements
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('.reference-node') || e.target.closest('.topic-rename-form')) {
      return;
    }

    // Don't drag if there's a modal open (adding reference)
    if (isAddingReference) {
      return;
    }

    // Don't drag if any modal is open (reference view/edit modal)
    if (document.querySelector('.reference-modal-overlay') || document.querySelector('.modal-backdrop')) {
      return;
    }

    // Don't drag if tooltip is open (to allow text selection in tooltip)
    if (document.querySelector('.reference-tooltip') || document.querySelector('.connection-tooltip')) {
      return;
    }

    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: position.x,
      offsetY: position.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;

    let newX = dragRef.current.offsetX + deltaX;
    let newY = dragRef.current.offsetY + deltaY;

    // Get canvas bounds
    const canvas = blockRef.current?.parentElement;
    const block = blockRef.current;

    if (canvas && block) {
      const canvasRect = canvas.getBoundingClientRect();
      const blockRect = block.getBoundingClientRect();
      const margin = 10;

      // Constrain within canvas bounds with margin
      newX = Math.max(margin, Math.min(newX, canvasRect.width - blockRect.width - margin));
      newY = Math.max(margin, Math.min(newY, canvasRect.height - blockRect.height - margin));

      // Check collision with other topics
      const allTopics = canvas.querySelectorAll('.topic-block');
      allTopics.forEach((otherBlock) => {
        if (otherBlock === block) return;

        const otherRect = otherBlock.getBoundingClientRect();
        const canvasOffset = canvas.getBoundingClientRect();

        // Calculate potential new position in viewport coordinates
        const newLeft = canvasOffset.left + newX;
        const newTop = canvasOffset.top + newY;
        const newRight = newLeft + blockRect.width;
        const newBottom = newTop + blockRect.height;

        // Check for overlap
        const overlap = !(
          newRight < otherRect.left ||
          newLeft > otherRect.right ||
          newBottom < otherRect.top ||
          newTop > otherRect.bottom
        );

        if (overlap) {
          // If overlapping, push away
          const overlapLeft = newRight - otherRect.left;
          const overlapRight = otherRect.right - newLeft;
          const overlapTop = newBottom - otherRect.top;
          const overlapBottom = otherRect.bottom - newTop;

          // Find smallest overlap and adjust position
          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

          if (minOverlap === overlapLeft) {
            newX = (otherRect.left - canvasOffset.left) - blockRect.width - 5;
          } else if (minOverlap === overlapRight) {
            newX = (otherRect.right - canvasOffset.left) + 5;
          } else if (minOverlap === overlapTop) {
            newY = (otherRect.top - canvasOffset.top) - blockRect.height - 5;
          } else {
            newY = (otherRect.bottom - canvasOffset.top) + 5;
          }

          // Constrain again after adjustment
          newX = Math.max(margin, Math.min(newX, canvasRect.width - blockRect.width - margin));
          newY = Math.max(margin, Math.min(newY, canvasRect.height - blockRect.height - margin));
        }
      });
    }

    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = async () => {
    if (!isDragging) return;

    setIsDragging(false);

    // Save new position to backend
    try {
      await fetch(`http://localhost:5000/api/topics/${topic.id}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_x: position.x, position_y: position.y }),
      });
    } catch (error) {
      console.error('Failed to update topic position:', error);
    }
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, position]);

  // Notify parent when position changes (for arrow updates)
  useEffect(() => {
    if (onPositionChange && isDragging) {
      onPositionChange(topic.id, position);
    }
  }, [position, isDragging, topic.id, onPositionChange]);

  return (
    <div
      ref={blockRef}
      className={`topic-block ${isDragging ? 'dragging' : ''}`}
      data-topic-id={topic.id}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="topic-header" style={{ borderBottomColor: topic.color || '#007bff' }}>
        {isRenaming ? (
          <div className="topic-rename-form">
            <input
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
            <div className="topic-rename-buttons">
              <button onClick={handleRenameSubmit}>✓</button>
              <button onClick={() => setIsRenaming(false)}>✕</button>
            </div>
          </div>
        ) : (
          <h3 onClick={() => setIsExpanded(!isExpanded)}>
            {topic.name}
          </h3>
        )}

        <div className="topic-actions">
          <button className="add-button" onClick={handleAddReference}>+</button>
          <div className="topic-menu">
            <button className="menu-button" onClick={toggleMenu}>⋮</button>
            {openMenu && (
              <div className="menu-dropdown">
                <button onClick={(e) => { e.stopPropagation(); handleRename(); }}>
                  Rename
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(); }}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="references-container">
        {references.map((reference) => (
          <ReferenceNode
            key={reference.id}
            reference={reference}
            onUpdate={loadReferences}
            onUpdateAll={onUpdate}
            currentTopicId={topic.id}
            projectId={topic.project_id}
            isPanelOpen={isPanelOpen}
            topicColor={topic.color || '#007bff'}
            onConnectionStart={onConnectionStart}
            onConnectionEnd={onConnectionEnd}
            isConnecting={isConnecting}
          />
        ))}
      </div>

      {isAddingReference && (
        <NewReferenceForm
          topicId={topic.id}
          onCancel={() => setIsAddingReference(false)}
          onAdded={handleReferenceAdded}
          onOpenWebPanel={onOpenWebPanel}
          isPanelOpen={isPanelOpen}
        />
      )}
    </div>
  );
}

function NewReferenceForm({ topicId, onCancel, onAdded, onOpenWebPanel, isPanelOpen }) {
  const [searchMode, setSearchMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('title');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    doi: '',
    authors: '',
    abstract: '',
    notes: '',
    citation_count: 0,
    publication_year: null,
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch('http://localhost:5000/api/search/papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          search_type: searchType,
          limit: 10,
        }),
      });

      if (response.ok) {
        const results = await response.json();
        setSearchResults(results);
      }
    } catch (error) {
      console.error('Failed to search papers:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPaper = (paper) => {
    setFormData({
      title: paper.title || '',
      doi: paper.doi || '',
      authors: paper.authors || '',
      abstract: paper.abstract || '',
      notes: '',
      citation_count: paper.citation_count || 0,
      publication_year: paper.year || null,
    });
    setSearchMode(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    try {
      const response = await fetch(`http://localhost:5000/api/topics/${topicId}/references`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        onAdded();
      }
    } catch (error) {
      console.error('Failed to add reference:', error);
    }
  };

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  if (searchMode) {
    return createPortal(
      <>
        <div className="modal-backdrop" onClick={onCancel} />
        <div className={`reference-search ${isPanelOpen ? 'with-panel' : ''}`} onClick={(e) => e.stopPropagation()}>
          <h4>Search for Paper</h4>
        <div className="search-controls">
          <select value={searchType} onChange={(e) => setSearchType(e.target.value)}>
            <option value="title">Title</option>
            <option value="author">Author</option>
            <option value="doi">DOI</option>
          </select>
          <input
            type="text"
            placeholder={`Search by ${searchType}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            autoFocus
          />
          <button onClick={handleSearch} disabled={isSearching}>
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((paper, index) => (
              <div
                key={index}
                className="search-result-item"
                onClick={() => handleSelectPaper(paper)}
              >
                <h5>{paper.title}</h5>
                <p className="result-authors">{paper.authors}</p>
                <p className="result-meta">
                  {paper.year && <span>{paper.year}</span>}
                  {paper.venue && <span> · {paper.venue}</span>}
                  {paper.citation_count !== undefined && (
                    <span> · {paper.citation_count} citations</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="search-footer">
          <button onClick={() => setSearchMode(false)}>Add Manually</button>
          <button onClick={onCancel}>Cancel</button>
        </div>

        <div className="scholar-link">
          <p>
            Not found your paper? Search in{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Google Scholar clicked!');
                console.log('onOpenWebPanel exists:', !!onOpenWebPanel);
                const scholarUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(searchQuery)}`;
                console.log('Opening URL:', scholarUrl);
                if (onOpenWebPanel) {
                  onOpenWebPanel(scholarUrl);
                } else {
                  console.error('onOpenWebPanel is not defined!');
                }
                setSearchMode(false);
              }}
            >
              Google Scholar
            </a>
          </p>
        </div>
      </div>
      </>,
      document.body
    );
  }

  return createPortal(
    <div className={`reference-form ${isPanelOpen ? 'with-panel' : ''}`} onClick={(e) => e.stopPropagation()}>
      <h4>Review & Add Reference</h4>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Title *"
          value={formData.title}
          onChange={(e) => handleChange('title', e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="DOI"
          value={formData.doi}
          onChange={(e) => handleChange('doi', e.target.value)}
        />
        <input
          type="text"
          placeholder="Authors"
          value={formData.authors}
          onChange={(e) => handleChange('authors', e.target.value)}
        />
        <input
          type="number"
          placeholder="Publication year *"
          value={formData.publication_year || ''}
          onChange={(e) => handleChange('publication_year', e.target.value ? parseInt(e.target.value) : null)}
          min="1900"
          max={new Date().getFullYear()}
          required
        />
        <input
          type="number"
          placeholder="Citation count (0 if unknown)"
          value={formData.citation_count}
          onChange={(e) => handleChange('citation_count', parseInt(e.target.value) || 0)}
          min="0"
        />
        <textarea
          placeholder="Abstract"
          value={formData.abstract}
          onChange={(e) => handleChange('abstract', e.target.value)}
          rows="3"
        />
        <textarea
          placeholder="Personal notes"
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows="2"
        />
        <div className="form-buttons">
          <button type="submit">Add Reference</button>
          <button type="button" onClick={() => setSearchMode(true)}>Back to Search</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

export default TopicBlock;

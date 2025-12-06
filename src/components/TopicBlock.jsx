import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReferenceNode from './ReferenceNode';
import './TopicBlock.css';

function TopicBlock({ topic, onUpdate, onOpenWebPanel, isPanelOpen, onConnectionStart, onConnectionEnd, isConnecting, onPositionChange, isSelected, onSelect, selectedTopics, allTopics }) {
  const GRID_CELL_SIZE = 40; // px per grid cell

  const [references, setReferences] = useState([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAddingReference, setIsAddingReference] = useState(false);
  const [openMenu, setOpenMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState(topic.name);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [position, setPosition] = useState({ x: topic.position_x, y: topic.position_y });
  const [gridSize, setGridSize] = useState({
    width: topic.grid_width || 5,
    height: topic.grid_height || 3
  });
  const dragRef = useRef({ startX: 0, startY: 0, offsetX: 0, offsetY: 0, groupOffsets: [], isCtrlPressed: false });
  const resizeRef = useRef({ startX: 0, startY: 0, startWidth: 0, startHeight: 0, direction: '' });
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
    onUpdate(); // Update parent ProjectView to refresh citation count
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

    // Prepare for dragging
    setIsDragging(true);

    // Save CTRL state for later
    const isCtrlPressed = e.ctrlKey || e.metaKey;

    // Calculate offsets for all selected topics (for group drag)
    const groupOffsets = [];
    if (selectedTopics && allTopics) {
      selectedTopics.forEach(selectedId => {
        const selectedTopic = allTopics.find(t => t.id === selectedId);
        if (selectedTopic) {
          groupOffsets.push({
            id: selectedId,
            offsetX: selectedTopic.position_x,
            offsetY: selectedTopic.position_y,
          });
        }
      });
    }

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: position.x,
      offsetY: position.y,
      groupOffsets: groupOffsets,
      isCtrlPressed: isCtrlPressed,
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;

    let newX = dragRef.current.offsetX + deltaX;
    let newY = dragRef.current.offsetY + deltaY;

    // SNAP TO GRID
    newX = Math.round(newX / GRID_CELL_SIZE) * GRID_CELL_SIZE;
    newY = Math.round(newY / GRID_CELL_SIZE) * GRID_CELL_SIZE;

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

      // Check collision with other topics (excluding selected ones in group drag)
      const allTopics = canvas.querySelectorAll('.topic-block');
      allTopics.forEach((otherBlock) => {
        if (otherBlock === block) return;

        // Skip collision check with other selected blocks during group drag
        const otherTopicId = parseInt(otherBlock.getAttribute('data-topic-id'));
        if (selectedTopics && selectedTopics.has(otherTopicId)) return;

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

    // Move other selected topics in the group
    if (selectedTopics && selectedTopics.size > 1 && dragRef.current.groupOffsets.length > 0) {
      // Calculate actual delta AFTER snap-to-grid
      const actualDeltaX = newX - dragRef.current.offsetX;
      const actualDeltaY = newY - dragRef.current.offsetY;

      dragRef.current.groupOffsets.forEach(({ id, offsetX, offsetY }) => {
        if (id === topic.id) return; // Skip current topic (already moved above)

        const otherBlock = document.querySelector(`[data-topic-id="${id}"]`);
        if (otherBlock) {
          // Apply the same delta to preserve relative positions
          let otherNewX = offsetX + actualDeltaX;
          let otherNewY = offsetY + actualDeltaY;

          // Apply position (already snapped via delta from snapped main block)
          otherBlock.style.left = `${otherNewX}px`;
          otherBlock.style.top = `${otherNewY}px`;
        }
      });
    }
  };

  const handleMouseUp = async () => {
    if (!isDragging) return;

    setIsDragging(false);

    // Check if there was actual movement
    const hasMoved = position.x !== dragRef.current.offsetX || position.y !== dragRef.current.offsetY;

    if (!hasMoved) {
      // No movement - this was a click, handle selection with CTRL
      const isCtrlPressed = dragRef.current.isCtrlPressed;

      if (isCtrlPressed && onSelect) {
        // Toggle selection only with CTRL
        onSelect(topic.id, true);
      }
      // Without CTRL, don't change selection (no single selection allowed)
      return;
    }

    // Save new position to backend for current topic
    try {
      await fetch(`http://localhost:5000/api/topics/${topic.id}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_x: position.x, position_y: position.y }),
      });
    } catch (error) {
      console.error('Failed to update topic position:', error);
    }

    // Save positions for other selected topics in the group
    if (selectedTopics && selectedTopics.size > 1 && dragRef.current.groupOffsets.length > 0) {
      const deltaX = position.x - dragRef.current.offsetX;
      const deltaY = position.y - dragRef.current.offsetY;

      for (const { id, offsetX, offsetY } of dragRef.current.groupOffsets) {
        if (id === topic.id) continue; // Skip current topic (already saved above)

        let otherNewX = offsetX + deltaX;
        let otherNewY = offsetY + deltaY;

        // SNAP TO GRID
        otherNewX = Math.round(otherNewX / GRID_CELL_SIZE) * GRID_CELL_SIZE;
        otherNewY = Math.round(otherNewY / GRID_CELL_SIZE) * GRID_CELL_SIZE;

        try {
          await fetch(`http://localhost:5000/api/topics/${id}/position`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position_x: otherNewX, position_y: otherNewY }),
          });
        } catch (error) {
          console.error(`Failed to update position for topic ${id}:`, error);
        }
      }

      // Just trigger arrow update without full refresh
      if (onPositionChange) {
        onPositionChange();
      }
    }
  };

  // Resize handlers
  const handleResizeStart = (e, direction) => {
    e.stopPropagation();
    e.preventDefault();

    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: gridSize.width,
      startHeight: gridSize.height,
      direction: direction
    };
  };

  const handleResizeMove = (e) => {
    if (!isResizing) return;

    const deltaX = e.clientX - resizeRef.current.startX;
    const deltaY = e.clientY - resizeRef.current.startY;
    const direction = resizeRef.current.direction;

    // Calculate delta in grid cells
    const deltaGridX = Math.round(deltaX / GRID_CELL_SIZE);
    const deltaGridY = Math.round(deltaY / GRID_CELL_SIZE);

    let newWidth = resizeRef.current.startWidth;
    let newHeight = resizeRef.current.startHeight;

    // Apply deltas based on direction
    if (direction.includes('e')) {
      newWidth = resizeRef.current.startWidth + deltaGridX;
    }
    if (direction.includes('w')) {
      newWidth = resizeRef.current.startWidth - deltaGridX;
    }
    if (direction.includes('s')) {
      newHeight = resizeRef.current.startHeight + deltaGridY;
    }
    if (direction.includes('n')) {
      newHeight = resizeRef.current.startHeight - deltaGridY;
    }

    // Enforce minimum width (5 grid cells)
    newWidth = Math.max(5, newWidth);

    // Calculate dynamic minimum height based on references
    const topicPixelWidth = newWidth * GRID_CELL_SIZE;
    const padding = 30; // 15px left + 15px right
    const availableWidth = topicPixelWidth - padding;
    const refsPerRow = Math.floor(availableWidth / 40); // 30px circle + 10px gap = 40px per ref
    const numReferences = references.length;
    const numRows = refsPerRow > 0 ? Math.ceil(numReferences / refsPerRow) : 0;

    // Only apply dynamic height when references span multiple rows
    let minHeightCells = 3; // Default minimum
    if (numRows > 1) {
      // Calculate minimum height needed: header (70px) + rows of references (40px each) + padding (20px)
      // Convert to grid cells (divide by GRID_CELL_SIZE and round up)
      const minHeightPixels = 70 + (numRows * 40) + 20;
      minHeightCells = Math.max(3, Math.ceil(minHeightPixels / GRID_CELL_SIZE));
    }

    // Enforce minimum height
    newHeight = Math.max(minHeightCells, newHeight);

    // Check collision with other topics
    const canvas = blockRef.current?.parentElement;
    const block = blockRef.current;
    if (canvas && block) {
      const newPixelWidth = newWidth * GRID_CELL_SIZE;
      const newPixelHeight = newHeight * GRID_CELL_SIZE;
      const canvasRect = canvas.getBoundingClientRect();
      const blockRect = block.getBoundingClientRect();

      // Check collision with other topic blocks
      const allTopics = canvas.querySelectorAll('.topic-block');
      let collision = false;

      allTopics.forEach((otherBlock) => {
        if (otherBlock === block) return;

        const otherRect = otherBlock.getBoundingClientRect();
        const canvasOffset = canvasRect;

        // Calculate potential new bounds
        const newLeft = blockRect.left;
        const newTop = blockRect.top;
        const newRight = newLeft + newPixelWidth;
        const newBottom = newTop + newPixelHeight;

        // Check for overlap
        const overlap = !(
          newRight < otherRect.left ||
          newLeft > otherRect.right ||
          newBottom < otherRect.top ||
          newTop > otherRect.bottom
        );

        if (overlap) {
          collision = true;
        }
      });

      // Only apply new size if no collision
      if (!collision) {
        setGridSize({ width: newWidth, height: newHeight });
      }
    } else {
      setGridSize({ width: newWidth, height: newHeight });
    }
  };

  const handleResizeEnd = async () => {
    if (!isResizing) return;

    setIsResizing(false);

    // Save new dimensions to backend
    try {
      await fetch(`http://localhost:5000/api/topics/${topic.id}/dimensions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grid_width: gridSize.width, grid_height: gridSize.height }),
      });
      // Just trigger arrow update without full refresh
      if (onPositionChange) {
        onPositionChange();
      }
    } catch (error) {
      console.error('Failed to update topic dimensions:', error);
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

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, gridSize]);

  // Notify parent when position changes (for arrow updates)
  useEffect(() => {
    if (onPositionChange && isDragging) {
      onPositionChange(topic.id, position);
    }
  }, [position, isDragging, topic.id, onPositionChange]);

  return (
    <div
      ref={blockRef}
      className={`topic-block ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''} ${isSelected ? 'selected' : ''}`}
      data-topic-id={topic.id}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${gridSize.width * GRID_CELL_SIZE}px`,
        height: `${gridSize.height * GRID_CELL_SIZE}px`,
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

      {/* Resize handle - only bottom-right corner */}
      {!isRenaming && !isAddingReference && (
        <div
          className="resize-handle resize-se"
          onMouseDown={(e) => handleResizeStart(e, 'se')}
        />
      )}
    </div>
  );
}

function NewReferenceForm({ topicId, onCancel, onAdded, onOpenWebPanel, isPanelOpen }) {
  const [searchMode, setSearchMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    doi: '',
    authors: '',
    abstract: '',
    notes: '',
    citation_count: 0,
    publication_year: null,
    bibtex: '',
  });

  const handleSearchInScholar = () => {
    if (!searchQuery.trim()) return;

    const scholarUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(searchQuery)}`;
    if (onOpenWebPanel) {
      onOpenWebPanel(scholarUrl);
    }
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
            <input
              type="text"
              placeholder="Search in Google Scholar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchInScholar();
                }
              }}
              autoFocus
            />
            <button onClick={handleSearchInScholar}>Search</button>
          </div>

          <div className="search-footer">
            <button onClick={() => setSearchMode(false)}>Add Manually</button>
            <button onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </>,
      document.body
    );
  }

  return createPortal(
    <div className={`reference-form ${isPanelOpen ? 'with-panel' : ''}`} onClick={(e) => e.stopPropagation()}>
      <h4>Add Reference</h4>
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
          placeholder="BibTeX citation"
          value={formData.bibtex}
          onChange={(e) => handleChange('bibtex', e.target.value)}
          rows="4"
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

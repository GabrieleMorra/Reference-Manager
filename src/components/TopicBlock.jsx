import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReferenceNode from './ReferenceNode';
import './TopicBlock.css';

function TopicBlock({ topic, onUpdate, onOpenWebPanel, onCloseWebPanel, isPanelOpen, webPanelHidden, onSetWebPanelHidden, onConnectionStart, onConnectionEnd, isConnecting, onPositionChange, isSelected, onSelect, selectedTopics, allTopics, zoom = 1, referenceMatchesFilter, webPanelRef }) {
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
  // Reorder state
  const [reorderDragId, setReorderDragId] = useState(null);
  const [reorderDropIndex, setReorderDropIndex] = useState(null);
  const [reorderGhostPos, setReorderGhostPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ startX: 0, startY: 0, offsetX: 0, offsetY: 0, groupOffsets: [], isCtrlPressed: false });
  const resizeRef = useRef({ startX: 0, startY: 0, startWidth: 0, startHeight: 0, direction: '' });
  const blockRef = useRef(null);

  // Measure text width and return minimum grid cells needed
  const getMinWidthForTitle = (title) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '600 14px Inter, sans-serif'; // match topic-name font
    const textWidth = ctx.measureText(title).width;
    // header has padding (~30px), menu button (~60px), some breathing room (~20px)
    const neededPx = textWidth + 110;
    return Math.max(5, Math.ceil(neededPx / GRID_CELL_SIZE));
  };

  useEffect(() => {
    // Load references immediately on mount
    loadReferences();
  }, [topic.id]);

  // Auto-expand width on mount/rename if title doesn't fit
  useEffect(() => {
    const minWidth = getMinWidthForTitle(topic.name);
    if (minWidth > gridSize.width) {
      setGridSize(prev => ({ ...prev, width: minWidth }));
    }
  }, [topic.name]);

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

    // Auto-expand width to fit new title
    const minWidth = getMinWidthForTitle(renameName);
    if (minWidth > gridSize.width) {
      setGridSize(prev => ({ ...prev, width: minWidth }));
      // Persist new size
      try {
        await fetch(`http://localhost:5000/api/topics/${topic.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grid_width: minWidth }),
        });
      } catch (e) { /* size update is best-effort */ }
    }

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
    // Read live positions from DOM — allTopics may be stale after drags
    const groupOffsets = [];
    if (selectedTopics) {
      selectedTopics.forEach(selectedId => {
        const el = document.querySelector(`[data-topic-id="${selectedId}"]`);
        if (el) {
          groupOffsets.push({
            id: selectedId,
            offsetX: parseFloat(el.style.left) || 0,
            offsetY: parseFloat(el.style.top) || 0,
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

    const rawDeltaX = (e.clientX - dragRef.current.startX) / zoom;
    const rawDeltaY = (e.clientY - dragRef.current.startY) / zoom;

    // Snap delta to grid
    let snappedDX = Math.round(rawDeltaX / GRID_CELL_SIZE) * GRID_CELL_SIZE;
    let snappedDY = Math.round(rawDeltaY / GRID_CELL_SIZE) * GRID_CELL_SIZE;

    const canvas = blockRef.current?.parentElement;

    // Build list of all selected blocks with their proposed positions
    const groupOffsets = dragRef.current.groupOffsets;
    const isGroupDrag = selectedTopics && selectedTopics.size > 1 && groupOffsets.length > 0;

    // Proposed positions for all moving blocks
    const movingBlocks = isGroupDrag
      ? groupOffsets.map(({ id, offsetX, offsetY }) => {
          const el = document.querySelector(`[data-topic-id="${id}"]`);
          return {
            id,
            x: offsetX + snappedDX,
            y: offsetY + snappedDY,
            w: el ? el.offsetWidth : gridSize.width * GRID_CELL_SIZE,
            h: el ? el.offsetHeight : gridSize.height * GRID_CELL_SIZE,
          };
        })
      : [{
          id: topic.id,
          x: dragRef.current.offsetX + snappedDX,
          y: dragRef.current.offsetY + snappedDY,
          w: blockRef.current?.offsetWidth || gridSize.width * GRID_CELL_SIZE,
          h: blockRef.current?.offsetHeight || gridSize.height * GRID_CELL_SIZE,
        }];

    // Collect non-selected (obstacle) blocks from DOM
    const selectedIds = isGroupDrag ? selectedTopics : new Set([topic.id]);
    const obstacles = [];
    if (canvas) {
      canvas.querySelectorAll('.topic-block').forEach(el => {
        const tid = parseInt(el.getAttribute('data-topic-id'));
        if (selectedIds.has(tid)) return;
        obstacles.push({
          x: parseFloat(el.style.left) || 0,
          y: parseFloat(el.style.top) || 0,
          w: el.offsetWidth,
          h: el.offsetHeight,
        });
      });
    }

    // Check all moving blocks against all obstacles, adjust delta if any collide
    const gap = 5;
    for (const obs of obstacles) {
      for (const mb of movingBlocks) {
        const mx = mb.x, my = mb.y;
        const overlaps = !(mx + mb.w + gap <= obs.x || mx >= obs.x + obs.w + gap ||
                           my + mb.h + gap <= obs.y || my >= obs.y + obs.h + gap);
        if (overlaps) {
          // Calculate push-back needed for each direction
          const pushLeft  = (mx + mb.w + gap) - obs.x;   // moving block right edge vs obstacle left
          const pushRight = (obs.x + obs.w + gap) - mx;   // obstacle right edge vs moving block left
          const pushUp    = (my + mb.h + gap) - obs.y;
          const pushDown  = (obs.y + obs.h + gap) - my;

          const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown);

          if (minPush === pushLeft)       snappedDX -= pushLeft;
          else if (minPush === pushRight) snappedDX += pushRight;
          else if (minPush === pushUp)    snappedDY -= pushUp;
          else                            snappedDY += pushDown;

          // Recalculate all proposed positions with adjusted delta
          movingBlocks.forEach((block, i) => {
            const src = isGroupDrag ? groupOffsets[i] : { offsetX: dragRef.current.offsetX, offsetY: dragRef.current.offsetY };
            block.x = src.offsetX + snappedDX;
            block.y = src.offsetY + snappedDY;
          });
        }
      }
    }

    // Clamp: prevent any block going negative
    let minX = Infinity, minY = Infinity;
    movingBlocks.forEach(mb => {
      minX = Math.min(minX, mb.x);
      minY = Math.min(minY, mb.y);
    });
    if (minX < 0) snappedDX -= minX;
    if (minY < 0) snappedDY -= minY;

    // Apply positions
    const myNewX = dragRef.current.offsetX + snappedDX;
    const myNewY = dragRef.current.offsetY + snappedDY;
    setPosition({ x: myNewX, y: myNewY });

    if (isGroupDrag) {
      groupOffsets.forEach(({ id, offsetX, offsetY }) => {
        if (id === topic.id) return;
        const el = document.querySelector(`[data-topic-id="${id}"]`);
        if (el) {
          el.style.left = `${offsetX + snappedDX}px`;
          el.style.top = `${offsetY + snappedDY}px`;
        }
      });
    }
  };

  // Resolve overlap: nudge position to nearest free spot
  const resolveOverlap = (pos) => {
    const canvas = blockRef.current?.parentElement;
    const block = blockRef.current;
    if (!canvas || !block) return pos;

    const blockWidth = gridSize.width * GRID_CELL_SIZE;
    const blockHeight = gridSize.height * GRID_CELL_SIZE;
    const margin = 5;

    const otherBlocks = Array.from(canvas.querySelectorAll('.topic-block'))
      .filter(el => el !== block && !(selectedTopics && selectedTopics.has(parseInt(el.getAttribute('data-topic-id')))));

    const overlaps = (x, y) => {
      for (const other of otherBlocks) {
        const ox = parseFloat(other.style.left);
        const oy = parseFloat(other.style.top);
        const ow = other.offsetWidth;
        const oh = other.offsetHeight;
        if (!(x + blockWidth + margin <= ox || x >= ox + ow + margin ||
              y + blockHeight + margin <= oy || y >= oy + oh + margin)) {
          return true;
        }
      }
      return false;
    };

    if (!overlaps(pos.x, pos.y)) return pos;

    // Spiral search outward in grid steps to find free position
    for (let radius = 1; radius <= 20; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue; // only perimeter
          const nx = Math.round((pos.x + dx * GRID_CELL_SIZE) / GRID_CELL_SIZE) * GRID_CELL_SIZE;
          const ny = Math.round((pos.y + dy * GRID_CELL_SIZE) / GRID_CELL_SIZE) * GRID_CELL_SIZE;
          if (nx >= 0 && ny >= 0 && !overlaps(nx, ny)) {
            return { x: nx, y: ny };
          }
        }
      }
    }
    return pos; // fallback: keep current position
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

    // Resolve any overlap after drag
    const resolved = resolveOverlap(position);
    if (resolved.x !== position.x || resolved.y !== position.y) {
      setPosition(resolved);
    }

    // Save new position to backend for current topic
    try {
      await fetch(`http://localhost:5000/api/topics/${topic.id}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_x: resolved.x, position_y: resolved.y }),
      });
    } catch (error) {
      console.error('Failed to update topic position:', error);
    }

    // Save positions for other selected topics in the group
    if (selectedTopics && selectedTopics.size > 1 && dragRef.current.groupOffsets.length > 0) {
      for (const { id } of dragRef.current.groupOffsets) {
        if (id === topic.id) continue;

        // Read final position from DOM (set during handleMouseMove)
        const otherEl = document.querySelector(`[data-topic-id="${id}"]`);
        if (!otherEl) continue;
        const otherNewX = parseFloat(otherEl.style.left) || 0;
        const otherNewY = parseFloat(otherEl.style.top) || 0;

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

    const deltaX = (e.clientX - resizeRef.current.startX) / zoom;
    const deltaY = (e.clientY - resizeRef.current.startY) / zoom;
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

    // Check collision with other topics (all in canvas-space)
    const canvas = blockRef.current?.parentElement;
    const block = blockRef.current;
    if (canvas && block) {
      const newPixelWidth = newWidth * GRID_CELL_SIZE;
      const newPixelHeight = newHeight * GRID_CELL_SIZE;

      // Current block position in canvas-space
      const blockX = parseFloat(block.style.left) || 0;
      const blockY = parseFloat(block.style.top) || 0;

      // Check collision with other topic blocks
      const allTopicEls = canvas.querySelectorAll('.topic-block');
      let collision = false;

      allTopicEls.forEach((otherBlock) => {
        if (otherBlock === block) return;

        const otherX = parseFloat(otherBlock.style.left) || 0;
        const otherY = parseFloat(otherBlock.style.top) || 0;
        const otherW = otherBlock.offsetWidth;
        const otherH = otherBlock.offsetHeight;

        // Check for overlap (all canvas-space)
        const overlap = !(
          blockX + newPixelWidth < otherX ||
          blockX > otherX + otherW ||
          blockY + newPixelHeight < otherY ||
          blockY > otherY + otherH
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

  // --- Reference reorder via middle-click drag ---
  const getDropIndexFromMouse = (e) => {
    // Find insertion index by checking which gap between reference nodes the mouse is closest to
    const container = blockRef.current?.querySelector('.references-container');
    if (!container) return 0;

    const nodes = container.querySelectorAll('.reference-node');
    if (nodes.length === 0) return 0;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    let bestIndex = 0;
    let bestDist = Infinity;

    for (let i = 0; i <= nodes.length; i++) {
      let gapX, gapY;
      if (i < nodes.length) {
        const rect = nodes[i].getBoundingClientRect();
        // Insertion point is at the left edge of this node
        gapX = rect.left;
        gapY = rect.top + rect.height / 2;
      } else {
        // After last node
        const rect = nodes[nodes.length - 1].getBoundingClientRect();
        gapX = rect.right + 5; // gap/2
        gapY = rect.top + rect.height / 2;
      }

      const dist = Math.abs(mouseX - gapX) + Math.abs(mouseY - gapY) * 0.5;
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }

    return bestIndex;
  };

  const handleReorderStart = (refId, e) => {
    e.preventDefault();
    e.stopPropagation();
    setReorderDragId(refId);
    setReorderGhostPos({ x: e.clientX, y: e.clientY });
  };

  const handleReorderMove = (e) => {
    if (!reorderDragId) return;
    setReorderGhostPos({ x: e.clientX, y: e.clientY });
    const dropIdx = getDropIndexFromMouse(e);
    setReorderDropIndex(dropIdx);
  };

  const handleReorderEnd = async (e) => {
    if (!reorderDragId) return;
    // Only release on middle button up (button 1)
    if (e && e.button !== undefined && e.button !== 1) return;

    const dragIndex = references.findIndex(r => r.id === reorderDragId);
    const dropIdx = reorderDropIndex;

    setReorderDragId(null);
    setReorderDropIndex(null);

    if (dropIdx === null || dropIdx === dragIndex) {
      // No move, but still update arrows in case of any shift
      if (onPositionChange) onPositionChange();
      return;
    }

    // Calculate the actual target index after removal
    let targetIdx = dropIdx;
    if (dropIdx > dragIndex) targetIdx--;

    if (targetIdx === dragIndex) return;

    // Reorder locally
    const newRefs = [...references];
    const [moved] = newRefs.splice(dragIndex, 1);
    newRefs.splice(targetIdx, 0, moved);
    setReferences(newRefs);

    // Save to backend
    try {
      await fetch(`http://localhost:5000/api/topics/${topic.id}/references/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_ids: newRefs.map(r => r.id) }),
      });
      // Refresh parent topics state so arrow positions recalculate with new order
      onUpdate();
    } catch (error) {
      console.error('Failed to reorder references:', error);
      loadReferences();
    }
  };

  useEffect(() => {
    if (reorderDragId) {
      document.addEventListener('mousemove', handleReorderMove);
      document.addEventListener('mouseup', handleReorderEnd);
      return () => {
        document.removeEventListener('mousemove', handleReorderMove);
        document.removeEventListener('mouseup', handleReorderEnd);
      };
    }
  }, [reorderDragId, reorderDropIndex, references]);

  // Calculate insertion bar position from the DOM
  const getInsertionBarStyle = () => {
    if (reorderDropIndex === null || reorderDragId === null) return null;

    const container = blockRef.current?.querySelector('.references-container');
    if (!container) return null;
    const nodes = container.querySelectorAll('.reference-node');
    if (nodes.length === 0) return null;

    const containerRect = container.getBoundingClientRect();
    let barX, barY, barHeight;

    if (reorderDropIndex < nodes.length) {
      const rect = nodes[reorderDropIndex].getBoundingClientRect();
      barX = (rect.left - containerRect.left) / zoom - 3;
      barY = (rect.top - containerRect.top) / zoom;
      barHeight = rect.height / zoom;
    } else {
      const rect = nodes[nodes.length - 1].getBoundingClientRect();
      barX = (rect.right - containerRect.left) / zoom + 2;
      barY = (rect.top - containerRect.top) / zoom;
      barHeight = rect.height / zoom;
    }

    return {
      position: 'absolute',
      left: `${barX}px`,
      top: `${barY}px`,
      width: '3px',
      height: `${barHeight}px`,
      backgroundColor: 'var(--color-primary)',
      borderRadius: '2px',
      zIndex: 30,
      pointerEvents: 'none',
    };
  };

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
        borderTopColor: topic.color || 'var(--color-primary)',
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="topic-header" style={{ borderTopColor: topic.color || 'var(--color-primary)', borderBottomColor: topic.color || '#007bff' }}>
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
              <button onClick={handleRenameSubmit}>&#10003;</button>
              <button onClick={() => setIsRenaming(false)}>&#10005;</button>
            </div>
          </div>
        ) : (
          <>
            <span
              className={`topic-collapse-chevron ${!isExpanded ? 'collapsed' : ''}`}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              &#9660;
            </span>
            <h3 onClick={() => setIsExpanded(!isExpanded)}>
              {topic.name}
            </h3>
            <span className="ref-count-badge" style={{ backgroundColor: topic.color || 'var(--color-primary)' }}>
              {references.length}
            </span>
          </>
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

      <div className={`references-container ${!isExpanded ? 'collapsed' : ''}`} style={{ position: 'relative' }}>
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
            zoom={zoom}
            dimmed={referenceMatchesFilter ? !referenceMatchesFilter(reference) : false}
            onReorderStart={handleReorderStart}
            isBeingDragged={reorderDragId === reference.id}
          />
        ))}
        {/* Insertion bar indicator */}
        {reorderDragId !== null && (() => {
          const barStyle = getInsertionBarStyle();
          return barStyle ? <div style={barStyle} /> : null;
        })()}
      </div>

      {/* Ghost circle following the mouse */}
      {reorderDragId !== null && createPortal(
        <div
          className="reorder-ghost-circle"
          style={{
            position: 'fixed',
            left: `${reorderGhostPos.x}px`,
            top: `${reorderGhostPos.y}px`,
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            border: `3px solid ${topic.color || '#007bff'}`,
            backgroundColor: topic.color || '#007bff',
            opacity: 0.6,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 10000,
          }}
        />,
        document.body
      )}

      {isAddingReference && (
        <NewReferenceForm
          topicId={topic.id}
          onCancel={() => setIsAddingReference(false)}
          onAdded={handleReferenceAdded}
          onOpenWebPanel={onOpenWebPanel}
          onCloseWebPanel={onCloseWebPanel}
          isPanelOpen={isPanelOpen}
          webPanelHidden={webPanelHidden}
          onSetWebPanelHidden={onSetWebPanelHidden}
          webPanelRef={webPanelRef}
          allTopics={allTopics}
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

function NewReferenceForm({ topicId, onCancel, onAdded, onOpenWebPanel, onCloseWebPanel, isPanelOpen, webPanelHidden, onSetWebPanelHidden, webPanelRef, allTopics }) {
  // Modes: 'search' (initial), 'results' (auto-add results list), 'form' (manual input)
  const [mode, setMode] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pageNav, setPageNav] = useState({ hasNextPage: false, hasPrevPage: false });
  const [isNavigating, setIsNavigating] = useState(false);
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

  const handleAutoAdd = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);

    // Open Scholar panel and search (make sure it's visible for loading)
    const scholarUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(searchQuery)}`;
    if (onOpenWebPanel) {
      onOpenWebPanel(scholarUrl); // onOpenWebPanel already sets hidden=false
    }

    // Poll until Scholar results appear on the page, then scrape them
    try {
      if (webPanelRef?.current) {
        const found = await webPanelRef.current.waitForResults();
        if (found) {
          const data = await webPanelRef.current.scrapeScholarResults();
          const papers = data.papers || data;
          const nav = data.nav || { hasNextPage: false, hasPrevPage: false };
          setSearchResults(Array.isArray(papers) ? papers : []);
          setPageNav(nav);
          setMode('results');
        } else {
          setSearchResults([]);
          setPageNav({ hasNextPage: false, hasPrevPage: false });
          setMode('results');
        }
      }
    } catch (error) {
      console.error('Failed to scrape Scholar results:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePageNavigate = async (direction) => {
    if (!webPanelRef?.current || isNavigating) return;
    setIsNavigating(true);
    try {
      const success = await webPanelRef.current.navigateScholarPage(direction);
      if (success) {
        const data = await webPanelRef.current.scrapeScholarResults();
        const papers = data.papers || data;
        const nav = data.nav || { hasNextPage: false, hasPrevPage: false };
        setSearchResults(Array.isArray(papers) ? papers : []);
        setPageNav(nav);
      }
    } catch (error) {
      console.error('Failed to navigate Scholar page:', error);
    } finally {
      setIsNavigating(false);
    }
  };

  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  // Collect all existing reference titles across the project for duplicate detection
  const existingTitles = useMemo(() => {
    const titles = new Set();
    if (allTopics) {
      allTopics.forEach(t => {
        (t.references || []).forEach(r => {
          if (r.title) titles.add(r.title.trim().toLowerCase());
        });
      });
    }
    return titles;
  }, [allTopics]);

  const isPaperExisting = (paper) => {
    return paper.title && existingTitles.has(paper.title.trim().toLowerCase());
  };

  const handleSelectPaper = async (paper) => {
    if (isPaperExisting(paper)) {
      const confirmed = window.confirm(
        `"${paper.title}" is already in this project.\n\nAdd it again?`
      );
      if (!confirmed) return;
    }
    // Show form immediately with what we have
    setFormData({
      title: paper.title || '',
      doi: paper.href || '',
      authors: paper.authors || '',
      abstract: paper.snippet || '',
      notes: '',
      citation_count: paper.citationCount || 0,
      publication_year: paper.year ? parseInt(paper.year) : null,
      bibtex: '',
    });
    setMode('form');

    // Navigate Scholar to exact title search, scrape full abstract + BibTeX
    if (webPanelRef?.current && paper.title) {
      setIsFetchingDetails(true);
      try {
        const details = await webPanelRef.current.searchAndScrapeDetails(paper.title);
        const updates = {
          abstract: details.abstract || paper.snippet || '',
          bibtex: details.bibtex || '',
        };

        // Parse author and year from BibTeX (more accurate than Scholar scrape)
        if (details.bibtex) {
          const authorMatch = details.bibtex.match(/author\s*=\s*\{([^}]+)\}/i);
          if (authorMatch) updates.authors = authorMatch[1].trim();

          const yearMatch = details.bibtex.match(/year\s*=\s*\{(\d{4})\}/i);
          if (yearMatch) updates.publication_year = parseInt(yearMatch[1]);
        }

        setFormData(prev => ({ ...prev, ...updates }));
      } catch (error) {
        console.error('Failed to fetch details:', error);
      } finally {
        setIsFetchingDetails(false);
      }
    }
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

  // Search mode - initial view
  if (mode === 'search') {
    return createPortal(
      <>
        <div className="modal-backdrop" onClick={onCancel} />
        <div className={`reference-search ${isPanelOpen ? 'with-panel' : ''}`} onClick={(e) => e.stopPropagation()}>
          <h4>Search for Paper</h4>
          <div className="search-controls">
            <input
              type="text"
              placeholder="Search for papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAutoAdd();
                }
              }}
              autoFocus
            />
            <button onClick={handleAutoAdd} disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="search-footer">
            <button onClick={() => setMode('form')}>Add Manually</button>
            <button onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </>,
      document.body
    );
  }

  // Results mode - show papers scraped from Google Scholar
  if (mode === 'results') {
    return createPortal(
      <>
        <div className="modal-backdrop" onClick={onCancel} />
        <div className={`reference-search auto-add-results ${isPanelOpen ? 'with-panel' : ''}`} onClick={(e) => e.stopPropagation()}>
          <div className="results-header">
            <h4>Select a Paper</h4>
            <button
              className={`scholar-toggle-btn ${!webPanelHidden ? 'active' : ''}`}
              onClick={() => {
                if (onSetWebPanelHidden) onSetWebPanelHidden(!webPanelHidden);
              }}
              title={webPanelHidden ? 'Show Scholar panel' : 'Hide Scholar panel'}
            >
              {webPanelHidden ? 'Show Scholar' : 'Hide Scholar'}
            </button>
          </div>
          <p className="results-hint">Click a paper to auto-fill its details and BibTeX.</p>
          <div className="paper-results-list">
            {searchResults.length === 0 ? (
              <div className="no-results">No papers found. Try a different search or add manually.</div>
            ) : (
              searchResults.map((paper, index) => (
                <div
                  key={paper.cid || index}
                  className={`paper-result-item ${isPaperExisting(paper) ? 'paper-existing' : ''}`}
                  onClick={() => handleSelectPaper(paper)}
                >
                  <div className="paper-result-title">
                    {isPaperExisting(paper) && <span className="paper-existing-badge">Already added</span>}
                    <span dangerouslySetInnerHTML={{ __html: paper.titleHtml || paper.title }} />
                  </div>
                  <div className="paper-result-meta">
                    {paper.authors && <span className="paper-result-authors">{paper.authors.length > 80 ? paper.authors.slice(0, 80) + '...' : paper.authors}</span>}
                    {paper.year && <span className="paper-result-year">{paper.year}</span>}
                    {paper.citationCount > 0 && <span className="paper-result-citations">Cited: {paper.citationCount}</span>}
                  </div>
                  {paper.snippet && <div className="paper-result-snippet">{paper.snippet.length > 150 ? paper.snippet.slice(0, 150) + '...' : paper.snippet}</div>}
                </div>
              ))
            )}
          </div>
          {/* Page navigation */}
          {(pageNav.hasPrevPage || pageNav.hasNextPage) && (
            <div className="results-page-nav">
              <button
                onClick={() => handlePageNavigate('prev')}
                disabled={!pageNav.hasPrevPage || isNavigating}
              >
                &#8592; Previous
              </button>
              <span className="page-nav-status">{isNavigating ? 'Loading...' : ''}</span>
              <button
                onClick={() => handlePageNavigate('next')}
                disabled={!pageNav.hasNextPage || isNavigating}
              >
                Next &#8594;
              </button>
            </div>
          )}
          <div className="search-footer">
            <button onClick={() => { setSearchResults([]); setMode('search'); }}>Back to Search</button>
            <button onClick={() => setMode('form')}>Add Manually</button>
            <button onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </>,
      document.body
    );
  }

  // Form mode - manual input (possibly pre-filled from auto-add)
  return createPortal(
    <div className={`reference-form ${isPanelOpen ? 'with-panel' : ''} ${isFetchingDetails ? 'fetching' : ''}`} onClick={(e) => e.stopPropagation()}>
      <h4>Add Reference{isFetchingDetails ? ' — fetching details...' : ''}</h4>
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
          placeholder="BibTeX citation (auto-filled from Scholar or paste manually)"
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
          <button type="button" onClick={() => setMode('search')}>Back to Search</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

export default TopicBlock;

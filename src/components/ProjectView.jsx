import { useState, useEffect, useRef } from 'react';
import TopicBlock from './TopicBlock';
import ConnectionArrow from './ConnectionArrow';
import ConnectionModal from './ConnectionModal';
import './ProjectView.css';

const TOPIC_COLORS = [
  '#007bff', // Blue
  '#28a745', // Green
  '#dc3545', // Red
  '#ffc107', // Yellow
  '#17a2b8', // Cyan
  '#6f42c1', // Purple
  '#fd7e14', // Orange
];

function ProjectView({ project, onBack, onOpenWebPanel, isPanelOpen, onAddTopicStateChange }) {
  const [topics, setTopics] = useState([]);
  const [newTopicName, setNewTopicName] = useState('');
  const [selectedColor, setSelectedColor] = useState(TOPIC_COLORS[0]);
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Multi-selection state
  const [selectedTopics, setSelectedTopics] = useState(new Set());

  // Rectangle selection state
  const [isRectSelecting, setIsRectSelecting] = useState(false);
  const [rectStart, setRectStart] = useState({ x: 0, y: 0 });
  const [rectEnd, setRectEnd] = useState({ x: 0, y: 0 });

  // Connection state
  const [connections, setConnections] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStart, setConnectionStart] = useState(null);
  const [connectionEnd, setConnectionEnd] = useState(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [editingConnection, setEditingConnection] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [arrowUpdateTrigger, setArrowUpdateTrigger] = useState(0);
  const workspaceRef = useRef(null);

  useEffect(() => {
    loadTopics();
  }, [project.id]);

  useEffect(() => {
    // Notify parent component when add topic state changes
    if (onAddTopicStateChange) {
      onAddTopicStateChange(isAddingTopic);
    }
  }, [isAddingTopic, onAddTopicStateChange]);

  useEffect(() => {
    // Track mouse movement when connecting (but not when modal is shown)
    const handleMouseMove = (e) => {
      if (isConnecting && !showConnectionModal && workspaceRef.current) {
        const workspaceRect = workspaceRef.current.getBoundingClientRect();
        setMousePosition({
          x: e.clientX - workspaceRect.left,
          y: e.clientY - workspaceRect.top
        });
      }
    };

    const handleMouseUp = (e) => {
      if (isConnecting && !showConnectionModal) {
        // If mouse up is not on a reference node, cancel connection
        if (!e.target.closest('.reference-node')) {
          setIsConnecting(false);
          setConnectionStart(null);
        }
      }
    };

    if (isConnecting && !showConnectionModal) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isConnecting, showConnectionModal]);

  useEffect(() => {
    // Clear selection when CTRL is released (but not when rectangle selecting)
    const handleKeyUp = (e) => {
      if ((e.key === 'Control' || e.key === 'Meta') && !isRectSelecting) {
        clearSelection();
      }
    };

    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isRectSelecting]);

  const loadTopics = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/projects/${project.id}/topics`);
      const data = await response.json();
      setTopics(data);
      setRefreshKey(prev => prev + 1); // Force re-render of all TopicBlocks
      loadConnections(); // Load connections after topics are loaded
    } catch (error) {
      console.error('Failed to load topics:', error);
    }
  };

  const loadConnections = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/projects/${project.id}/connections`);
      const data = await response.json();
      setConnections(data);
    } catch (error) {
      console.error('Failed to load connections:', error);
    }
  };

  const handleAddTopic = async () => {
    if (!newTopicName.trim()) return;

    try {
      const response = await fetch(`http://localhost:5000/api/projects/${project.id}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTopicName,
          position_x: 50,
          position_y: 50 + topics.length * 150,
          color: selectedColor,
        }),
      });

      if (response.ok) {
        setNewTopicName('');
        setSelectedColor(TOPIC_COLORS[0]); // Reset to default color
        setIsAddingTopic(false);
        loadTopics();
      }
    } catch (error) {
      console.error('Failed to create topic:', error);
    }
  };

  // Connection handlers
  const handleConnectionStart = (referenceId, nodeElement) => {
    setIsConnecting(true);
    setConnectionStart({ referenceId, nodeElement });

    // Initialize mouse position at the node location
    if (nodeElement && workspaceRef.current) {
      const nodeRect = nodeElement.getBoundingClientRect();
      const workspaceRect = workspaceRef.current.getBoundingClientRect();
      setMousePosition({
        x: nodeRect.left - workspaceRect.left + nodeRect.width / 2,
        y: nodeRect.top - workspaceRect.top + nodeRect.height / 2
      });
    }
  };

  const handleConnectionEnd = (referenceId) => {
    if (connectionStart && connectionStart.referenceId !== referenceId) {
      setConnectionEnd(referenceId);
      setShowConnectionModal(true);
    } else {
      // Reset if trying to connect to same node
      setIsConnecting(false);
      setConnectionStart(null);
    }
  };

  const handleSaveConnection = async (description) => {
    if (!connectionStart || !connectionEnd) return;

    // Close modal immediately
    setShowConnectionModal(false);

    try {
      const response = await fetch('http://localhost:5000/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_reference_id: connectionStart.referenceId,
          target_reference_id: connectionEnd,
          description: description,
        }),
      });

      if (response.ok) {
        // Wait for connections to be fully loaded
        await loadConnections();

        // Wait for React to render the permanent arrows before removing temporary arrow
        await new Promise(resolve => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });

        // Reset connection state after permanent arrow is rendered
        setIsConnecting(false);
        setConnectionStart(null);
        setConnectionEnd(null);
      } else {
        // Reset on failure
        setIsConnecting(false);
        setConnectionStart(null);
        setConnectionEnd(null);
      }
    } catch (error) {
      console.error('Failed to create connection:', error);
      // Reset on error
      setIsConnecting(false);
      setConnectionStart(null);
      setConnectionEnd(null);
    }
  };

  const handleCancelConnection = () => {
    setShowConnectionModal(false);
    setIsConnecting(false);
    setConnectionStart(null);
    setConnectionEnd(null);
    setEditingConnection(null);
  };

  const handleDeleteConnection = async (connectionId) => {
    if (!window.confirm('Eliminare questo collegamento?')) return;

    try {
      const response = await fetch(`http://localhost:5000/api/connections/${connectionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadConnections();
      }
    } catch (error) {
      console.error('Failed to delete connection:', error);
    }
  };

  const handleEditConnection = (connection) => {
    setEditingConnection(connection);
    setShowConnectionModal(true);
  };

  const handleUpdateConnection = async (description) => {
    if (!editingConnection) return;

    try {
      const response = await fetch(`http://localhost:5000/api/connections/${editingConnection.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });

      if (response.ok) {
        loadConnections();
      }
    } catch (error) {
      console.error('Failed to update connection:', error);
    }

    setShowConnectionModal(false);
    setEditingConnection(null);
  };

  // Handle topic position changes (for real-time arrow updates)
  const handleTopicPositionChange = () => {
    // Trigger re-render of arrows by updating state
    setArrowUpdateTrigger(prev => prev + 1);
  };

  // Multi-selection handlers
  const handleTopicSelect = (topicId, isCtrlPressed) => {
    if (isCtrlPressed) {
      setSelectedTopics(prev => {
        const newSet = new Set(prev);
        if (newSet.has(topicId)) {
          newSet.delete(topicId);
        } else {
          newSet.add(topicId);
        }
        return newSet;
      });
    } else {
      // Single selection - clear others
      setSelectedTopics(new Set([topicId]));
    }
  };

  const clearSelection = () => {
    setSelectedTopics(new Set());
  };

  // Rectangle selection handlers
  const handleCanvasMouseDown = (e) => {
    // Only start rectangle selection if clicking on canvas background
    if (e.target.classList.contains('canvas')) {
      const workspaceRect = workspaceRef.current.getBoundingClientRect();
      const startX = e.clientX - workspaceRect.left;
      const startY = e.clientY - workspaceRect.top;

      setIsRectSelecting(true);
      setRectStart({ x: startX, y: startY });
      setRectEnd({ x: startX, y: startY });
      clearSelection(); // Clear existing selection when starting new rectangle selection
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (isRectSelecting) {
      const workspaceRect = workspaceRef.current.getBoundingClientRect();
      const currentX = e.clientX - workspaceRect.left;
      const currentY = e.clientY - workspaceRect.top;

      setRectEnd({ x: currentX, y: currentY });
    }
  };

  const handleCanvasMouseUp = (e) => {
    if (isRectSelecting) {
      // Calculate selection rectangle bounds
      const minX = Math.min(rectStart.x, rectEnd.x);
      const maxX = Math.max(rectStart.x, rectEnd.x);
      const minY = Math.min(rectStart.y, rectEnd.y);
      const maxY = Math.max(rectStart.y, rectEnd.y);

      // Find all topics that intersect with the selection rectangle
      const selectedIds = new Set();
      topics.forEach(topic => {
        const topicElement = document.querySelector(`[data-topic-id="${topic.id}"]`);
        if (topicElement) {
          const topicRect = topicElement.getBoundingClientRect();
          const workspaceRect = workspaceRef.current.getBoundingClientRect();

          const topicLeft = topicRect.left - workspaceRect.left;
          const topicTop = topicRect.top - workspaceRect.top;
          const topicRight = topicLeft + topicRect.width;
          const topicBottom = topicTop + topicRect.height;

          // Check if rectangles intersect
          if (!(topicRight < minX || topicLeft > maxX || topicBottom < minY || topicTop > maxY)) {
            selectedIds.add(topic.id);
          }
        }
      });

      setSelectedTopics(selectedIds);
      setIsRectSelecting(false);
    }
  };

  // Get reference node positions for rendering arrows
  const getReferencePositions = () => {
    const GRID_CELL_SIZE = 40;
    const positions = {};

    topics.forEach(topic => {
      if (topic.references) {
        const gridWidth = topic.grid_width || 5;
        const topicPixelWidth = gridWidth * GRID_CELL_SIZE;
        const padding = 30; // 15px left + 15px right
        const availableWidth = topicPixelWidth - padding;
        const refsPerRow = Math.floor(availableWidth / 40); // 30px circle + 10px gap = 40px per ref

        topic.references.forEach((ref, index) => {
          const topicElement = document.querySelector(`[data-topic-id="${topic.id}"]`);
          if (topicElement) {
            const topicRect = topicElement.getBoundingClientRect();
            const workspaceRect = workspaceRef.current?.getBoundingClientRect() || { left: 0, top: 0 };

            // Calculate row and column
            const row = Math.floor(index / refsPerRow);
            const col = index % refsPerRow;

            // Position with multi-row support
            positions[ref.id] = {
              x: topicRect.left - workspaceRect.left + 15 + (col * 40) + 15, // +15 for circle center
              y: topicRect.top - workspaceRect.top + 70 + (row * 40) + 15 // 70 = header height, +15 for circle center
            };
          }
        });
      }
    });
    return positions;
  };

  // Calculate unique citations count
  const getUniqueCitationsCount = () => {
    const uniqueRefs = new Set();
    topics.forEach(topic => {
      if (topic.references) {
        topic.references.forEach(ref => {
          // Use DOI if available, otherwise use normalized title
          const identifier = ref.doi && ref.doi.trim() !== ''
            ? ref.doi.toLowerCase().trim()
            : ref.title.toLowerCase().trim();
          uniqueRefs.add(identifier);
        });
      }
    });
    return uniqueRefs.size;
  };

  const handleExportBibliography = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/projects/${project.id}/export/bibliography`);
      const data = await response.json();

      if (data.bibliography) {
        // Create a blob and download
        const blob = new Blob([data.bibliography], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.title.replace(/[^a-z0-9]/gi, '_')}_bibliography.bib`;
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
  };

  return (
    <div className={`project-view ${isPanelOpen ? 'with-panel' : ''}`}>
      <div className="project-header">
        <button onClick={onBack}>← Back to Projects</button>
        <h2>{project.title}</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => onOpenWebPanel('https://scholar.google.com')}>Google Scholar</button>
          <button onClick={handleExportBibliography}>Export Bibliography</button>
          <button onClick={() => setIsAddingTopic(true)}>+ Add Topic</button>
        </div>
      </div>

      {isAddingTopic && (
        <div className="add-topic-form" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            placeholder="Topic name..."
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddTopic()}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
          <div className="color-picker-bar"></div>
          <div className="color-picker">
            {TOPIC_COLORS.map((color) => (
              <div
                key={color}
                className={`color-option ${selectedColor === color ? 'selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setSelectedColor(color)}
              />
            ))}
          </div>
          <button onClick={handleAddTopic}>Add</button>
          <button onClick={() => setIsAddingTopic(false)}>Cancel</button>
        </div>
      )}

      <div
        className="canvas"
        ref={workspaceRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
      >
        {/* SVG layer for arrows */}
        <svg className="connections-layer">
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="0"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="#333" fillOpacity="0.30" />
            </marker>
            <marker
              id="arrowhead-hover"
              markerWidth="10"
              markerHeight="10"
              refX="0"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="#333" fillOpacity="1.0" />
            </marker>
            <marker
              id="arrowhead-temp"
              markerWidth="10"
              markerHeight="10"
              refX="0"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="#007bff" />
            </marker>
          </defs>
          {/* Temporary arrow during connection and modal */}
          {(isConnecting || showConnectionModal) && connectionStart && connectionStart.nodeElement && (
            <g>
              <path
                d={(() => {
                  const nodeRect = connectionStart.nodeElement.getBoundingClientRect();
                  const workspaceRect = workspaceRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
                  const centerStartX = nodeRect.left - workspaceRect.left + nodeRect.width / 2;
                  const centerStartY = nodeRect.top - workspaceRect.top + nodeRect.height / 2;

                  // If connection end is set, use fixed target position, otherwise follow mouse
                  let centerTargetX, centerTargetY;
                  if (connectionEnd) {
                    const positions = getReferencePositions();
                    const targetPos = positions[connectionEnd];
                    if (targetPos) {
                      centerTargetX = targetPos.x;
                      centerTargetY = targetPos.y;
                    } else {
                      centerTargetX = mousePosition.x;
                      centerTargetY = mousePosition.y;
                    }
                  } else {
                    centerTargetX = mousePosition.x;
                    centerTargetY = mousePosition.y;
                  }

                  // Calculate angle and adjust for circle edges
                  const dx = centerTargetX - centerStartX;
                  const dy = centerTargetY - centerStartY;
                  const angle = Math.atan2(dy, dx);
                  const circleRadius = 15; // Reference node is 30px diameter
                  const arrowheadLength = 21; // Arrow marker length (triangle is 9px, positioned at base)

                  const startX = centerStartX + Math.cos(angle) * circleRadius;
                  const startY = centerStartY + Math.sin(angle) * circleRadius;
                  const endX = centerTargetX - Math.cos(angle) * (connectionEnd ? circleRadius + arrowheadLength : 0);
                  const endY = centerTargetY - Math.sin(angle) * (connectionEnd ? circleRadius + arrowheadLength : 0);

                  return `M ${startX} ${startY} L ${endX} ${endY}`;
                })()}
                fill="none"
                stroke="#ccc"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            </g>
          )}

          {connections.map((conn) => {
            const positions = getReferencePositions();
            const sourcePos = positions[conn.source_reference_id];
            const targetPos = positions[conn.target_reference_id];

            if (sourcePos && targetPos) {
              return (
                <g key={`${conn.id}-${arrowUpdateTrigger}`} style={{ pointerEvents: 'auto' }}>
                  <ConnectionArrow
                    connection={conn}
                    sourcePos={sourcePos}
                    targetPos={targetPos}
                    onDelete={handleDeleteConnection}
                    onEdit={handleEditConnection}
                  />
                </g>
              );
            }
            return null;
          })}
        </svg>

        {topics.map((topic) => (
          <TopicBlock
            key={`${topic.id}-${refreshKey}`}
            topic={topic}
            onUpdate={loadTopics}
            onOpenWebPanel={onOpenWebPanel}
            isPanelOpen={isPanelOpen}
            onConnectionStart={handleConnectionStart}
            onConnectionEnd={handleConnectionEnd}
            isConnecting={isConnecting}
            onPositionChange={handleTopicPositionChange}
            isSelected={selectedTopics.has(topic.id)}
            onSelect={handleTopicSelect}
            selectedTopics={selectedTopics}
            allTopics={topics}
          />
        ))}

        {/* Rectangle selection overlay */}
        {isRectSelecting && (
          <div
            className="selection-rectangle"
            style={{
              left: `${Math.min(rectStart.x, rectEnd.x)}px`,
              top: `${Math.min(rectStart.y, rectEnd.y)}px`,
              width: `${Math.abs(rectEnd.x - rectStart.x)}px`,
              height: `${Math.abs(rectEnd.y - rectStart.y)}px`,
            }}
          />
        )}
      </div>

      {showConnectionModal && (
        <ConnectionModal
          onSave={editingConnection ? handleUpdateConnection : handleSaveConnection}
          onCancel={handleCancelConnection}
          initialDescription={editingConnection?.description || ''}
        />
      )}

      <div className="citations-counter">
        Total Citations: {getUniqueCitationsCount()}
      </div>
    </div>
  );
}

export default ProjectView;

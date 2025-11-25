import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ConnectionArrow.css';

function ConnectionArrow({ connection, sourcePos, targetPos, onDelete, onEdit }) {
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const pathRef = useRef(null);
  const tooltipRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  // Calculate arrow path
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  // Circle radius (reference node is 30px diameter, so 15px radius)
  const circleRadius = 15;
  // Arrow marker length: triangle is 9px wide, positioned at base (refX="0")
  // Need to add full triangle width (9px) to prevent arrow tip from touching circle
  const arrowheadLength = 21;

  // Calculate start and end points on circle edges
  const startX = sourcePos.x + Math.cos(angle) * circleRadius;
  const startY = sourcePos.y + Math.sin(angle) * circleRadius;
  // End at circle edge + arrowhead length (stops before the triangle tip)
  const endX = targetPos.x - Math.cos(angle) * (circleRadius + arrowheadLength);
  const endY = targetPos.y - Math.sin(angle) * (circleRadius + arrowheadLength);

  // Simple straight line for now
  const pathD = `M ${startX} ${startY} L ${endX} ${endY}`;

  const handleMouseEnter = (e) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsHovered(true);
    setShowTooltip(true);
    setMousePosition({ x: e.clientX, y: e.clientY });

    // Use mouse position as reference point
    updateTooltipPosition(e.clientX, e.clientY);
  };

  // Recalculate position when tooltip is rendered with actual dimensions
  useEffect(() => {
    if (showTooltip && tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Recalculate with actual dimensions
        updateTooltipPosition(mousePosition.x, mousePosition.y);
      }
    }
  }, [showTooltip]);

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
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
    setIsHovered(false);
  };

  const updateTooltipPosition = (mouseX, mouseY) => {
    const margin = 20; // Margin from window edges

    // Get actual tooltip dimensions if available, otherwise use estimates
    let tooltipWidth = 300; // max-width from CSS
    let tooltipHeight = 100; // estimated height

    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        tooltipWidth = rect.width;
        tooltipHeight = rect.height;
      }
    }

    // Calculate arrow direction and perpendicular
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const arrowLength = Math.sqrt(dx * dx + dy * dy);

    // Perpendicular vector (normalized) - points "left" relative to arrow direction
    const perpX = -dy / arrowLength;
    const perpY = dx / arrowLength;

    // Use a small, fixed offset for a closer tooltip
    // Just enough to clear the arrow with some visual padding
    const offset = 15;

    // Try positioning to the left side of the arrow (perpendicular direction)
    let x = mouseX + perpX * offset;
    let y = mouseY + perpY * offset;

    // Check if would go off screen on this side
    const wouldGoOffScreen =
      x < margin ||
      x + tooltipWidth > window.innerWidth - margin ||
      y < margin ||
      y + tooltipHeight > window.innerHeight - margin;

    if (wouldGoOffScreen) {
      // Try the other side of the arrow
      x = mouseX - perpX * offset;
      y = mouseY - perpY * offset;
    }

    // Force inside window boundaries (may overlap arrow if necessary)
    x = Math.max(margin, Math.min(x, window.innerWidth - tooltipWidth - margin));
    y = Math.max(margin, Math.min(y, window.innerHeight - tooltipHeight - margin));

    setTooltipPosition({ x, y });
  };

  return (
    <>
      <g>
        {/* Invisible thicker path for easier hovering */}
        <path
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth="20"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'pointer' }}
        />

        {/* Visible arrow path */}
        <path
          ref={pathRef}
          d={pathD}
          fill="none"
          stroke="#333"
          strokeWidth="2"
          strokeOpacity={isHovered ? 1.0 : 0.30}
          markerEnd={isHovered ? 'url(#arrowhead-hover)' : 'url(#arrowhead)'}
          className="connection-arrow"
          style={{
            transition: 'stroke-opacity 0.2s',
            pointerEvents: 'none'
          }}
        />
      </g>

      {showTooltip && connection.description && createPortal(
        <div
          ref={tooltipRef}
          className="connection-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <div className="connection-tooltip-header">
            <button
              className="connection-tooltip-btn"
              onClick={() => onEdit(connection)}
              title="Modifica"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button
              className="connection-tooltip-btn delete"
              onClick={() => onDelete(connection.id)}
              title="Elimina"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
          <div className="connection-tooltip-content">
            {connection.description}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default ConnectionArrow;

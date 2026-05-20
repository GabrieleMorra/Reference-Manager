import { useState, useEffect, useRef, useCallback } from 'react';
import TopicBlock from './TopicBlock';
import ConnectionArrow from './ConnectionArrow';
import ConnectionModal from './ConnectionModal';
import { cleanBibTeXText } from '../bibtex';
import './ProjectView.css';

// Extract a surname from a single author string. Two common forms:
//   "Morra, Gabriele"           → surname is the part before the comma → "Morra"
//   "Gabriele Morra"            → surname is the last whitespace token → "Morra"
//   "Morra"                     → just the surname → "Morra"
function surnameOf(author) {
  let s = (author || '').trim();
  if (!s) return '';
  // Strip trailing "et al." / "et al" so it doesn't get parsed as a surname
  s = s.replace(/[,;\s]+et\s+al\.?$/i, '').trim();
  if (s.includes(',')) {
    // "Last, First" — keep the part before the first comma
    return s.split(',')[0].trim();
  }
  // "First Last" — last whitespace-separated token
  const tokens = s.split(/\s+/);
  return tokens[tokens.length - 1];
}

// Heuristic: a corporate / institutional author (e.g. "U.S. Air Force",
// "National Aeronautics and Space Administration", "US Department of
// Defense"). In that case the full name should be kept, not parsed as
// "Surname, Given Name".
function looksLikeOrganization(s) {
  if (!s) return false;
  // BibTeX/manual personal-author lists always carry either a "Last, First"
  // comma or a ';' separator. If neither is present, it's likely a single
  // organisation name.
  if (s.includes(',') || s.includes(';')) return false;
  // Trigger words that strongly suggest an institutional author
  const orgWords = /\b(university|institute|department|agency|administration|laboratory|labs?|center|centre|force|navy|army|command|corporation|company|inc\.?|ltd\.?|society|association|council|committee|commission|office|bureau|ministry|government|foundation|group|organisation|organization|national|international|federal)\b/i;
  if (orgWords.test(s)) return true;
  // No commas, several words, no " and " surrounded by personal-name pieces:
  // treat as organisation if it has 3+ words. Personal "First Middle Last"
  // is the only false positive — still acceptable, surname == last word.
  // Keep "First Last" (2 words) and single names parsed as personal.
  return false;
}

// Render "First-author-surname et al., YYYY" for the sidebar reference rows.
// Handles BibTeX "Last, First and Last, First and …", semicolon-separated
// and comma-separated lists, plus corporate authors.
function formatRefAuthorYear(ref) {
  const year = ref.publication_year || '';
  const raw = cleanBibTeXText((ref.authors || '').trim());
  let first = '';

  if (raw) {
    // Corporate / institutional author → show the whole name as-is.
    if (looksLikeOrganization(raw)) {
      first = raw;
    } else {
      // Decide author separator. BibTeX uses " and ", many editors use ";".
      // Plain "," is ambiguous because it's also the "Last, First" separator,
      // so we only split on "," when neither " and " nor ";" is present.
      let parts;
      if (/\s+and\s+/i.test(raw)) {
        parts = raw.split(/\s+and\s+/i);
      } else if (raw.includes(';')) {
        parts = raw.split(';');
      } else if ((raw.match(/,/g) || []).length >= 2) {
        // Plain "A, B, C" list — split on every comma
        parts = raw.split(',');
      } else {
        // Either a single author "Last, First" or a single name
        parts = [raw];
      }

      first = surnameOf(parts[0]);
      const hasMore = parts.length > 1 && parts.slice(1).some(p => p.trim().length > 0);
      if (hasMore) first = `${first} et al.`;
    }
  }

  if (first && year) return `${first}, ${year}`;
  return first || (year ? String(year) : '');
}

const TOPIC_COLORS = [
  '#007bff', // Blue
  '#28a745', // Green
  '#dc3545', // Red
  '#ffc107', // Yellow
  '#17a2b8', // Cyan
  '#6f42c1', // Purple
  '#fd7e14', // Orange
];

function ProjectView({ project, onOpenWebPanel, onCloseWebPanel, isPanelOpen, isAddingTopic, onSetIsAddingTopic, webPanelRef, webPanelHidden, onSetWebPanelHidden }) {
  const [topics, setTopics] = useState([]);
  // Which topic trees in the sidebar are currently expanded
  const [expandedSidebarTopics, setExpandedSidebarTopics] = useState(new Set());
  // Drag-over highlight for sidebar references receiving a PDF drop
  const [pdfDropTargetRef, setPdfDropTargetRef] = useState(null);
  // Reference id awaiting a PDF picked through the hidden file input
  const [pdfPickerRefId, setPdfPickerRefId] = useState(null);
  const sidebarPdfInputRef = useRef(null);
  // Which canvas reference-node we are currently faking-hover from the sidebar
  const hoveredCanvasRefRef = useRef(null);
  const [newTopicName, setNewTopicName] = useState('');
  const [selectedColor, setSelectedColor] = useState(TOPIC_COLORS[0]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterHasNotes, setFilterHasNotes] = useState(false);
  const [filterYearMin, setFilterYearMin] = useState('');
  const [filterYearMax, setFilterYearMax] = useState('');
  const [filterCitationsMin, setFilterCitationsMin] = useState('');
  const searchInputRef = useRef(null);

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
  const [zoom, setZoom] = useState(1.0);
  const workspaceRef = useRef(null);

  useEffect(() => {
    loadTopics();
  }, [project.id]);

  useEffect(() => {
    // Track mouse movement when connecting (but not when modal is shown)
    const handleMouseMove = (e) => {
      if (isConnecting && !showConnectionModal && workspaceRef.current) {
        const workspaceRect = workspaceRef.current.getBoundingClientRect();
        const scrollLeft = workspaceRef.current.scrollLeft || 0;
        const scrollTop = workspaceRef.current.scrollTop || 0;
        setMousePosition({
          x: (e.clientX - workspaceRect.left + scrollLeft) / zoom,
          y: (e.clientY - workspaceRect.top + scrollTop) / zoom
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
  }, [isConnecting, showConnectionModal, zoom]);

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
      // Find position below the lowest topic on the left side
      let newPosX = 50;
      let newPosY = 50;
      if (topics.length > 0) {
        let lowestBottom = 0;
        topics.forEach(t => {
          const h = (t.grid_height || 3) * 40;
          const bottom = t.position_y + h;
          if (bottom > lowestBottom) {
            lowestBottom = bottom;
          }
        });
        newPosY = lowestBottom + 40; // 40px gap below lowest block
      }

      const response = await fetch(`http://localhost:5000/api/projects/${project.id}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTopicName,
          position_x: newPosX,
          position_y: newPosY,
          color: selectedColor,
        }),
      });

      if (response.ok) {
        setNewTopicName('');
        setSelectedColor(TOPIC_COLORS[0]); // Reset to default color
        onSetIsAddingTopic(false);
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

    // Initialize mouse position at the node location using canvas-space positions
    const positions = getReferencePositions();
    const startPos = positions[referenceId];
    if (startPos) {
      setMousePosition({ x: startPos.x, y: startPos.y });
    } else if (nodeElement && workspaceRef.current) {
      const nodeRect = nodeElement.getBoundingClientRect();
      const workspaceRect = workspaceRef.current.getBoundingClientRect();
      const scrollLeft = workspaceRef.current.scrollLeft || 0;
      const scrollTop = workspaceRef.current.scrollTop || 0;
      setMousePosition({
        x: (nodeRect.left - workspaceRect.left + scrollLeft + nodeRect.width / 2) / zoom,
        y: (nodeRect.top - workspaceRect.top + scrollTop + nodeRect.height / 2) / zoom
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
    if (!window.confirm('Delete this connection?')) return;

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
  const [minimapTrigger, setMinimapTrigger] = useState(0);

  const handleTopicPositionChange = () => {
    // Trigger re-render of arrows and minimap by updating state
    setArrowUpdateTrigger(prev => prev + 1);
    setMinimapTrigger(prev => prev + 1);
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

  // Zoom handlers
  const ZOOM_MIN = 0.3;
  const ZOOM_MAX = 2.0;
  const ZOOM_STEP = 0.1;

  const clampZoom = (z) => Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) * 10) / 10;

  const handleZoomIn = useCallback(() => {
    setZoom(prev => clampZoom(prev + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => clampZoom(prev - ZOOM_STEP));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1.0);
  }, []);

  // Update arrows when zoom changes
  useEffect(() => {
    setArrowUpdateTrigger(prev => prev + 1);
  }, [zoom]);

  // Ctrl+scroll zoom on canvas
  const handleCanvasWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoom(prev => clampZoom(prev + ZOOM_STEP));
      } else {
        setZoom(prev => clampZoom(prev - ZOOM_STEP));
      }
    }
  }, []);

  // Attach wheel listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const canvas = workspaceRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleCanvasWheel);
  }, [handleCanvasWheel]);

  // Track scroll position for minimap viewport updates
  const [scrollPos, setScrollPos] = useState({ left: 0, top: 0 });
  useEffect(() => {
    const canvas = workspaceRef.current;
    if (!canvas) return;
    const handleScroll = () => {
      setScrollPos({ left: canvas.scrollLeft, top: canvas.scrollTop });
    };
    canvas.addEventListener('scroll', handleScroll);
    return () => canvas.removeEventListener('scroll', handleScroll);
  }, []);

  // Keyboard shortcuts for zoom
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          handleZoomOut();
        } else if (e.key === '0') {
          e.preventDefault();
          handleZoomReset();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleZoomIn, handleZoomOut, handleZoomReset]);

  // Auto-collapse sidebar at narrow widths
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const handler = (e) => setSidebarExpanded(!e.matches);
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleSidebarTopicClick = (topicId) => {
    const el = document.querySelector(`[data-topic-id="${topicId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  };

  const toggleSidebarTopicExpanded = (topicId, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setExpandedSidebarTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  // Open the PDF attached to a reference inside the WebPanel
  const handleSidebarOpenReferencePdf = (ref, e) => {
    if (e) e.stopPropagation();
    if (!ref || !ref.pdf_path) return;
    if (onOpenWebPanel) {
      onOpenWebPanel(`http://localhost:5000/api/references/${ref.id}/pdf-view`);
    }
  };

  // Drag-and-drop PDF onto a reference row in the sidebar → upload as
  // attachment for that reference. Mirrors the "Add PDF" context menu action.
  const handleSidebarRefDragOver = (refId, e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setPdfDropTargetRef(refId);
  };

  const handleSidebarRefDragLeave = (refId, e) => {
    e.preventDefault();
    e.stopPropagation();
    setPdfDropTargetRef(prev => (prev === refId ? null : prev));
  };

  const uploadPdfForReference = async (refId, file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Only PDF files are accepted.');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      const response = await fetch(`http://localhost:5000/api/references/${refId}/pdf`, {
        method: 'POST',
        body: fd,
      });
      if (response.ok) {
        loadTopics();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(`Failed to attach PDF: ${err.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to upload PDF:', error);
      alert('Failed to upload PDF');
    }
  };

  const handleSidebarRefDrop = (refId, e) => {
    e.preventDefault();
    e.stopPropagation();
    setPdfDropTargetRef(null);
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    uploadPdfForReference(refId, file);
  };

  // Click on a reference without a PDF → open the OS file picker so the
  // user can attach one. Same upload flow as drag-and-drop.
  const handleSidebarRefAddPdfClick = (refId, e) => {
    if (e) e.stopPropagation();
    setPdfPickerRefId(refId);
    if (sidebarPdfInputRef.current) {
      sidebarPdfInputRef.current.value = '';
      sidebarPdfInputRef.current.click();
    }
  };

  // Hovering a reference row in the sidebar should highlight the matching
  // ReferenceNode on the canvas: scroll it into view, make the parent topic
  // expanded if needed, then fire a synthetic mouseenter so the existing
  // tooltip + scale-up effect of ReferenceNode triggers exactly as if the
  // user were hovering the dot itself.
  // React's synthetic onMouseEnter/onMouseLeave are derived from the native
  // mouseover/mouseout pair (these bubble, mouseenter/leave do not). So to
  // make React's handlers run on a remote element we dispatch the bubbling
  // pair with the correct relatedTarget.
  const fireMouseOver = (el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const evt = new MouseEvent('mouseover', {
      bubbles: true, cancelable: true, view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      relatedTarget: null,
    });
    el.dispatchEvent(evt);
  };

  const fireMouseOut = (el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const evt = new MouseEvent('mouseout', {
      bubbles: true, cancelable: true, view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      relatedTarget: document.body,
    });
    el.dispatchEvent(evt);
  };

  const handleSidebarRefHoverEnter = (refId) => {
    const el = document.querySelector(`[data-reference-id="${refId}"]`);
    if (!el) return;

    // If we were already highlighting another dot, leave it first
    if (hoveredCanvasRefRef.current && hoveredCanvasRefRef.current !== el) {
      hoveredCanvasRefRef.current.classList.remove('force-hover');
      fireMouseOut(hoveredCanvasRefRef.current);
    }
    hoveredCanvasRefRef.current = el;

    // Bring the topic block (and the dot inside it) into view
    const topicEl = el.closest('.topic-block');
    if (topicEl) {
      topicEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }

    // CSS :hover is driven by the real cursor — add a class so the same
    // visual effect kicks in for our synthetic highlight.
    el.classList.add('force-hover');
    fireMouseOver(el);
  };

  const handleSidebarRefHoverLeave = (refId) => {
    const el = hoveredCanvasRefRef.current
      || document.querySelector(`[data-reference-id="${refId}"]`);
    if (el) {
      el.classList.remove('force-hover');
      fireMouseOut(el);
    }
    if (hoveredCanvasRefRef.current === el) hoveredCanvasRefRef.current = null;
  };

  const handleSidebarPdfPicked = async (e) => {
    const file = e.target.files && e.target.files[0];
    const refId = pdfPickerRefId;
    e.target.value = '';
    setPdfPickerRefId(null);
    if (!file || !refId) return;
    await uploadPdfForReference(refId, file);
  };

  const getTotalReferencesCount = () => {
    let count = 0;
    topics.forEach(t => { if (t.references) count += t.references.length; });
    return count;
  };

  // Ctrl+F / Ctrl+K to focus search
  useEffect(() => {
    const handleSearchShortcut = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'k')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, []);

  const hasActiveFilter = searchQuery || filterHasNotes || filterYearMin || filterYearMax || filterCitationsMin;

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterHasNotes(false);
    setFilterYearMin('');
    setFilterYearMax('');
    setFilterCitationsMin('');
  };

  const referenceMatchesFilter = (ref) => {
    if (!hasActiveFilter) return true;
    const q = searchQuery.toLowerCase();
    if (q) {
      const matchesText = (ref.title || '').toLowerCase().includes(q)
        || (ref.authors || '').toLowerCase().includes(q)
        || (ref.doi || '').toLowerCase().includes(q)
        || (ref.notes || '').toLowerCase().includes(q);
      if (!matchesText) return false;
    }
    if (filterHasNotes && !(ref.notes && ref.notes.trim())) return false;
    if (filterYearMin && ref.publication_year < parseInt(filterYearMin)) return false;
    if (filterYearMax && ref.publication_year > parseInt(filterYearMax)) return false;
    if (filterCitationsMin && (ref.citation_count || 0) < parseInt(filterCitationsMin)) return false;
    return true;
  };

  // Convert mouse event to canvas-space coordinates (accounts for scroll + zoom)
  const mouseToCanvas = (e) => {
    const container = workspaceRef.current;
    const rect = container.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left + container.scrollLeft) / zoom,
      y: (e.clientY - rect.top + container.scrollTop) / zoom,
    };
  };

  // Middle-mouse pan state
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Rectangle selection handlers
  const handleCanvasMouseDown = (e) => {
    // Middle mouse button (button 1) = pan
    if (e.button === 1) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: workspaceRef.current.scrollLeft,
        scrollTop: workspaceRef.current.scrollTop,
      };
      workspaceRef.current.style.cursor = 'grabbing';
      return;
    }

    // Only start rectangle selection if clicking on canvas background or canvas-content
    if (e.target.classList.contains('canvas') || e.target.classList.contains('canvas-content')) {
      const pos = mouseToCanvas(e);

      setIsRectSelecting(true);
      setRectStart(pos);
      setRectEnd(pos);
      clearSelection(); // Clear existing selection when starting new rectangle selection
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      workspaceRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
      workspaceRef.current.scrollTop = panStartRef.current.scrollTop - dy;
      return;
    }
    if (isRectSelecting) {
      setRectEnd(mouseToCanvas(e));
    }
  };

  const handleCanvasMouseUp = (e) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      workspaceRef.current.style.cursor = '';
      return;
    }
    if (isRectSelecting) {
      // Selection rect bounds are now in canvas-space
      const minX = Math.min(rectStart.x, rectEnd.x);
      const maxX = Math.max(rectStart.x, rectEnd.x);
      const minY = Math.min(rectStart.y, rectEnd.y);
      const maxY = Math.max(rectStart.y, rectEnd.y);

      // Find all topics that intersect with the selection rectangle
      const selectedIds = new Set();
      const container = workspaceRef.current;
      const containerRect = container.getBoundingClientRect();

      topics.forEach(topic => {
        const topicElement = document.querySelector(`[data-topic-id="${topic.id}"]`);
        if (topicElement) {
          const topicRect = topicElement.getBoundingClientRect();

          // Convert topic screen-space bounds to canvas-space
          const topicLeft = (topicRect.left - containerRect.left + container.scrollLeft) / zoom;
          const topicTop = (topicRect.top - containerRect.top + container.scrollTop) / zoom;
          const topicRight = topicLeft + topicRect.width / zoom;
          const topicBottom = topicTop + topicRect.height / zoom;

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

  // Get reference node positions for rendering arrows (all canvas-space)
  const getReferencePositions = () => {
    const GRID_CELL_SIZE = 40;
    const positions = {};

    topics.forEach(topic => {
      if (topic.references) {
        const topicElement = document.querySelector(`[data-topic-id="${topic.id}"]`);
        if (!topicElement) return;

        // Use canvas-space position directly from the element's inline style
        const topicX = parseFloat(topicElement.style.left) || 0;
        const topicY = parseFloat(topicElement.style.top) || 0;

        const gridWidth = topic.grid_width || 5;
        const topicPixelWidth = gridWidth * GRID_CELL_SIZE;
        const padding = 30; // 15px left + 15px right
        const availableWidth = topicPixelWidth - padding;
        const refsPerRow = Math.floor(availableWidth / 40); // 30px circle + 10px gap = 40px per ref

        topic.references.forEach((ref, index) => {
          const row = Math.floor(index / refsPerRow);
          const col = index % refsPerRow;

          positions[ref.id] = {
            x: topicX + 15 + (col * 40) + 15,
            y: topicY + 70 + (row * 40) + 15
          };
        });
      }
    });
    return positions;
  };

  // Look up a reference title by ID from loaded topics
  const getReferenceTitleById = (refId) => {
    for (const topic of topics) {
      if (topic.references) {
        const ref = topic.references.find(r => r.id === refId);
        if (ref) return ref.title;
      }
    }
    return '';
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

  return (
    <div className={`project-view ${isPanelOpen ? 'with-panel' : ''}`}>
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
          <button onClick={() => onSetIsAddingTopic(false)}>Cancel</button>
        </div>
      )}

      {/* Global Search Bar */}
      <div className="search-bar-strip">
        <div className="search-bar-input-wrap">
          <span className="search-bar-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            ref={searchInputRef}
            type="text"
            className="search-bar-input"
            placeholder="Search references... (Ctrl+F)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {hasActiveFilter && (
            <button className="search-bar-clear" onClick={clearAllFilters} title="Clear all filters">&times;</button>
          )}
        </div>
        <div className="search-filter-chips">
          <button
            className={`filter-chip ${filterHasNotes ? 'active' : ''}`}
            onClick={() => setFilterHasNotes(prev => !prev)}
          >Has notes</button>
          <span className="filter-chip-group">
            <input
              type="number"
              className="filter-year-input"
              placeholder="Year min"
              value={filterYearMin}
              onChange={(e) => setFilterYearMin(e.target.value)}
              min="1900"
            />
            <span className="filter-chip-sep">-</span>
            <input
              type="number"
              className="filter-year-input"
              placeholder="Year max"
              value={filterYearMax}
              onChange={(e) => setFilterYearMax(e.target.value)}
              min="1900"
            />
          </span>
          <input
            type="number"
            className="filter-citations-input"
            placeholder="Min citations"
            value={filterCitationsMin}
            onChange={(e) => setFilterCitationsMin(e.target.value)}
            min="0"
          />
        </div>
      </div>

      {/* Hidden file input used when clicking a no-PDF reference in the sidebar */}
      <input
        ref={sidebarPdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={handleSidebarPdfPicked}
      />

      <div className="project-body">
      {/* Collapsible Sidebar */}
      <aside className={`sidebar ${sidebarExpanded ? 'expanded' : 'collapsed'}`}>
        <button className="sidebar-toggle" onClick={() => setSidebarExpanded(prev => !prev)} title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}>
          <span className={`sidebar-chevron ${sidebarExpanded ? '' : 'rotated'}`}>&#8249;</span>
        </button>
        {sidebarExpanded && (
          <>
            <div className="sidebar-section-label">Topics</div>
            <ul className="sidebar-topic-list">
              {topics.map(topic => {
                const isExpanded = expandedSidebarTopics.has(topic.id);
                const refs = topic.references || [];
                return (
                  <li key={topic.id} className="sidebar-topic-group">
                    <div
                      className={`sidebar-topic-item ${isExpanded ? 'expanded' : ''}`}
                      onClick={(e) => toggleSidebarTopicExpanded(topic.id, e)}
                      onDoubleClick={() => handleSidebarTopicClick(topic.id)}
                      title="Click to expand · Double-click to jump on canvas"
                      style={{ '--topic-color': topic.color || '#007bff' }}
                    >
                      <span
                        className={`sidebar-topic-chevron ${isExpanded ? 'open' : ''}`}
                        aria-hidden="true"
                      >&#9654;</span>
                      <span className="sidebar-topic-dot" style={{ backgroundColor: topic.color || '#007bff' }}></span>
                      <span className="sidebar-topic-name">{topic.name}</span>
                      <span className="sidebar-topic-badge">{refs.length}</span>
                    </div>

                    {isExpanded && (
                      <ul className="sidebar-ref-list">
                        {refs.length === 0 && (
                          <li className="sidebar-ref-empty">No references</li>
                        )}
                        {refs.map(ref => {
                          const hasPdf = !!ref.pdf_path;
                          const isDropTarget = pdfDropTargetRef === ref.id;
                          return (
                            <li
                              key={ref.id}
                              className={`sidebar-ref-item ${hasPdf ? 'has-pdf' : 'no-pdf'} ${isDropTarget ? 'pdf-drop-target' : ''}`}
                              onClick={hasPdf
                                ? (e) => handleSidebarOpenReferencePdf(ref, e)
                                : (e) => handleSidebarRefAddPdfClick(ref.id, e)}
                              onMouseEnter={() => handleSidebarRefHoverEnter(ref.id)}
                              onMouseLeave={() => handleSidebarRefHoverLeave(ref.id)}
                              onDragOver={(e) => handleSidebarRefDragOver(ref.id, e)}
                              onDragEnter={(e) => handleSidebarRefDragOver(ref.id, e)}
                              onDragLeave={(e) => handleSidebarRefDragLeave(ref.id, e)}
                              onDrop={(e) => handleSidebarRefDrop(ref.id, e)}
                            >
                              <span
                                className={`sidebar-ref-pdf-icon ${hasPdf ? '' : 'missing'}`}
                                aria-hidden="true"
                              >
                                <svg viewBox="0 0 24 24" width="18" height="18">
                                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" fill="currentColor"/>
                                  <path d="M14 2v6h6" fill="rgba(255,255,255,0.35)"/>
                                  <text x="12" y="17" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">PDF</text>
                                </svg>
                              </span>
                              <div className="sidebar-ref-body">
                                <div className="sidebar-ref-title">{cleanBibTeXText(ref.title)}</div>
                                <div className="sidebar-ref-meta">
                                  <span className="sidebar-ref-author-year">
                                    {formatRefAuthorYear(ref)}
                                  </span>
                                  <span className="sidebar-ref-citations">
                                    {ref.citation_count || 0} cit
                                  </span>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
              {topics.length === 0 && (
                <li className="sidebar-empty">No topics yet</li>
              )}
            </ul>
            <div className="sidebar-separator"></div>
          </>
        )}
        {!sidebarExpanded && (
          <ul className="sidebar-topic-list icon-only">
            {topics.map(topic => (
              <li key={topic.id} className="sidebar-topic-item" onClick={() => handleSidebarTopicClick(topic.id)} title={topic.name}>
                <span className="sidebar-topic-dot" style={{ backgroundColor: topic.color || '#007bff' }}></span>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div
        className="canvas"
        ref={workspaceRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onAuxClick={(e) => e.preventDefault()}
        style={{
          backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
        }}
      >
        <div
          className="canvas-content"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
          }}
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
                  // Use canvas-space positions from getReferencePositions for accuracy at all zoom levels
                  const positions = getReferencePositions();
                  const startPos = positions[connectionStart.referenceId];
                  let centerStartX, centerStartY;
                  if (startPos) {
                    centerStartX = startPos.x;
                    centerStartY = startPos.y;
                  } else {
                    // Fallback: convert from screen-space
                    const nodeRect = connectionStart.nodeElement.getBoundingClientRect();
                    const workspaceRect = workspaceRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
                    const scrollLeft = workspaceRef.current?.scrollLeft || 0;
                    const scrollTop = workspaceRef.current?.scrollTop || 0;
                    centerStartX = (nodeRect.left - workspaceRect.left + scrollLeft + nodeRect.width / 2) / zoom;
                    centerStartY = (nodeRect.top - workspaceRect.top + scrollTop + nodeRect.height / 2) / zoom;
                  }

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
                <g key={`${conn.id}-${arrowUpdateTrigger}-${zoom}`} style={{ pointerEvents: 'auto' }}>
                  <ConnectionArrow
                    connection={conn}
                    sourcePos={sourcePos}
                    targetPos={targetPos}
                    onDelete={handleDeleteConnection}
                    onEdit={handleEditConnection}
                    zoom={zoom}
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
            onCloseWebPanel={onCloseWebPanel}
            isPanelOpen={isPanelOpen}
            webPanelHidden={webPanelHidden}
            onSetWebPanelHidden={onSetWebPanelHidden}
            onConnectionStart={handleConnectionStart}
            onConnectionEnd={handleConnectionEnd}
            isConnecting={isConnecting}
            onPositionChange={handleTopicPositionChange}
            isSelected={selectedTopics.has(topic.id)}
            onSelect={handleTopicSelect}
            selectedTopics={selectedTopics}
            allTopics={topics}
            zoom={zoom}
            referenceMatchesFilter={referenceMatchesFilter}
            webPanelRef={webPanelRef}
          />
        ))}

        {/* Rectangle selection overlay (canvas-space, inside zoom transform) */}
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
        </div>{/* end canvas-content */}
      </div>

      {showConnectionModal && (
        <ConnectionModal
          onSave={editingConnection ? handleUpdateConnection : handleSaveConnection}
          onCancel={handleCancelConnection}
          onDelete={editingConnection ? () => { handleDeleteConnection(editingConnection.id); setShowConnectionModal(false); setEditingConnection(null); } : undefined}
          initialDescription={editingConnection?.description || ''}
          sourceTitle={editingConnection ? getReferenceTitleById(editingConnection.source_reference_id) : (connectionStart ? getReferenceTitleById(connectionStart.referenceId) : '')}
          targetTitle={editingConnection ? getReferenceTitleById(editingConnection.target_reference_id) : (connectionEnd ? getReferenceTitleById(connectionEnd) : '')}
          isEditing={!!editingConnection}
        />
      )}

      {/* Minimap — rendered at 300×200, CSS-scaled to 150×100 normally */}
      {(() => {
        // Internal (hi-res) dimensions
        const MM_W = 300;
        const MM_H = 200;

        // Read live positions from DOM for accurate minimap
        void minimapTrigger; // depend on trigger for re-render
        const liveTopics = topics.map(t => {
          const el = workspaceRef.current?.querySelector(`[data-topic-id="${t.id}"]`);
          if (el) {
            return {
              ...t,
              position_x: parseFloat(el.style.left) || t.position_x,
              position_y: parseFloat(el.style.top) || t.position_y,
              grid_width: Math.round(el.offsetWidth / 40) || t.grid_width || 5,
              grid_height: Math.round(el.offsetHeight / 40) || t.grid_height || 3,
            };
          }
          return t;
        });

        let maxX = 2000, maxY = 2000;
        liveTopics.forEach(t => {
          const w = (t.grid_width || 5) * 40;
          const h = (t.grid_height || 3) * 40;
          maxX = Math.max(maxX, t.position_x + w + 100);
          maxY = Math.max(maxY, t.position_y + h + 100);
        });
        const scaleX = MM_W / maxX;
        const scaleY = MM_H / maxY;
        const scale = Math.min(scaleX, scaleY);
        const container = workspaceRef.current;

        // Viewport rect in minimap coords
        const viewX = container ? (scrollPos.left / zoom) * scale : 0;
        const viewY = container ? (scrollPos.top / zoom) * scale : 0;
        const viewW = container ? (container.clientWidth / zoom) * scale : MM_W;
        const viewH = container ? (container.clientHeight / zoom) * scale : MM_H;

        // Convert a mouse event on the minimap to minimap-internal coords
        const minimapEventToCoords = (e, minimapEl) => {
          const rect = minimapEl.getBoundingClientRect();
          // The CSS renders at 300x200 but displays at a scaled size.
          // getBoundingClientRect gives the displayed size, so compute the ratio.
          const ratioX = MM_W / rect.width;
          const ratioY = MM_H / rect.height;
          return {
            x: (e.clientX - rect.left) * ratioX,
            y: (e.clientY - rect.top) * ratioY,
          };
        };

        const scrollCanvasTo = (mmX, mmY) => {
          if (!container) return;
          const canvasX = mmX / scale;
          const canvasY = mmY / scale;
          container.scrollLeft = canvasX * zoom - container.clientWidth / 2;
          container.scrollTop = canvasY * zoom - container.clientHeight / 2;
        };

        const handleMinimapMouseDown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const minimapEl = e.currentTarget;
          const coords = minimapEventToCoords(e, minimapEl);

          // Check if clicking inside the viewport rect — start drag
          const insideViewport =
            coords.x >= viewX && coords.x <= viewX + viewW &&
            coords.y >= viewY && coords.y <= viewY + viewH;

          if (insideViewport) {
            // Drag the viewport
            const offsetX = coords.x - viewX;
            const offsetY = coords.y - viewY;

            const onMove = (moveE) => {
              const moveCoords = minimapEventToCoords(moveE, minimapEl);
              const newViewX = moveCoords.x - offsetX;
              const newViewY = moveCoords.y - offsetY;
              // Convert viewport top-left to canvas scroll
              if (container) {
                container.scrollLeft = (newViewX / scale) * zoom;
                container.scrollTop = (newViewY / scale) * zoom;
              }
            };

            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          } else {
            // Click outside viewport — jump to position
            scrollCanvasTo(coords.x, coords.y);
          }
        };

        return (
          <div className="minimap" onMouseDown={handleMinimapMouseDown}>
            <div className="minimap-inner">
              {liveTopics.map(t => (
                <div key={t.id} className="minimap-block" style={{
                  left: `${t.position_x * scale}px`,
                  top: `${t.position_y * scale}px`,
                  width: `${(t.grid_width || 5) * 40 * scale}px`,
                  height: `${(t.grid_height || 3) * 40 * scale}px`,
                  backgroundColor: t.color || '#007bff',
                }} />
              ))}
              <div className="minimap-viewport" style={{
                left: `${viewX}px`,
                top: `${viewY}px`,
                width: `${viewW}px`,
                height: `${viewH}px`,
              }} />
            </div>
          </div>
        );
      })()}

      </div>{/* end project-body */}

      {/* Status bar */}
      <div className="status-bar">
        <span className="status-bar-left">{getTotalReferencesCount()} references</span>
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={handleZoomOut} disabled={zoom <= ZOOM_MIN} title="Zoom out (Ctrl+-)">-</button>
          <span className="zoom-level" onClick={handleZoomReset} title="Reset zoom (Ctrl+0)">{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={handleZoomIn} disabled={zoom >= ZOOM_MAX} title="Zoom in (Ctrl++)">+</button>
        </div>
        <span className="status-bar-right"></span>
      </div>
    </div>
  );
}

export default ProjectView;

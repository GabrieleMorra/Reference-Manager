import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ConnectionModal.css';

const CONNECTION_TYPES = ['cites', 'contradicts', 'extends', 'reviews'];

function ConnectionModal({ onSave, onCancel, onDelete, initialDescription = '', sourceTitle, targetTitle, isEditing = false }) {
  const [description, setDescription] = useState(initialDescription);
  const [selectedType, setSelectedType] = useState('');

  useEffect(() => {
    // Parse type prefix from existing description
    const match = initialDescription.match(/^\[(cites|contradicts|extends|reviews)\]\s*/);
    if (match) {
      setSelectedType(match[1]);
      setDescription(initialDescription.replace(match[0], ''));
    } else {
      setDescription(initialDescription);
    }
  }, [initialDescription]);

  const handleSave = () => {
    const prefix = selectedType ? `[${selectedType}] ` : '';
    onSave(prefix + description);
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return createPortal(
    <div className="connection-modal-overlay" onClick={handleBackdropClick}>
      <div className="connection-modal">
        <div className="connection-modal-header">
          <h3>Link Motivation</h3>
          <button className="connection-modal-close" onClick={onCancel}>&times;</button>
        </div>

        {(sourceTitle || targetTitle) && (
          <div className="connection-modal-refs">
            {sourceTitle && <span className="connection-ref-pill source">{sourceTitle}</span>}
            <span className="connection-ref-arrow">&rarr;</span>
            {targetTitle && <span className="connection-ref-pill target">{targetTitle}</span>}
          </div>
        )}

        <div className="connection-modal-content">
          <div className="connection-type-chips">
            {CONNECTION_TYPES.map(type => (
              <button
                key={type}
                className={`connection-type-chip ${selectedType === type ? 'active' : ''}`}
                onClick={() => setSelectedType(selectedType === type ? '' : type)}
              >
                {type}
              </button>
            ))}
          </div>
          <textarea
            id="connection-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe why these references are connected..."
            rows="4"
            autoFocus
          />
        </div>
        <div className="connection-modal-actions">
          {isEditing && onDelete && (
            <button className="connection-delete-btn" onClick={onDelete}>Delete</button>
          )}
          <div className="connection-modal-actions-right">
            <button className="connection-save-btn" onClick={handleSave}>
              Save
            </button>
            <button className="connection-cancel-btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConnectionModal;

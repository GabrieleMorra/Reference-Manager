import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ConnectionModal.css';

function ConnectionModal({ onSave, onCancel, initialDescription = '' }) {
  const [description, setDescription] = useState(initialDescription);

  useEffect(() => {
    setDescription(initialDescription);
  }, [initialDescription]);

  const handleSave = () => {
    onSave(description);
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
          <button className="connection-modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="connection-modal-content">
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
          <button className="connection-save-btn" onClick={handleSave}>
            Save
          </button>
          <button className="connection-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConnectionModal;

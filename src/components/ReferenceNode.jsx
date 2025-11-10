import { useState } from 'react';
import './ReferenceNode.css';

function ReferenceNode({ reference, onUpdate }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <div
        className="reference-node"
        onClick={() => setShowDetails(true)}
        title={reference.title}
      />

      {showDetails && (
        <div className="reference-modal-overlay" onClick={() => setShowDetails(false)}>
          <div className="reference-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{reference.title}</h3>
              <button onClick={() => setShowDetails(false)}>×</button>
            </div>

            <div className="modal-content">
              {reference.doi && (
                <div className="field">
                  <label>DOI:</label>
                  <p>{reference.doi}</p>
                </div>
              )}

              {reference.authors && (
                <div className="field">
                  <label>Authors:</label>
                  <p>{reference.authors}</p>
                </div>
              )}

              {reference.abstract && (
                <div className="field">
                  <label>Abstract:</label>
                  <p>{reference.abstract}</p>
                </div>
              )}

              {reference.notes && (
                <div className="field">
                  <label>Personal Notes:</label>
                  <p>{reference.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ReferenceNode;

import { useState, useEffect } from 'react';
import ReferenceNode from './ReferenceNode';
import './TopicBlock.css';

function TopicBlock({ topic, onUpdate }) {
  const [references, setReferences] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddingReference, setIsAddingReference] = useState(false);

  useEffect(() => {
    if (isExpanded) {
      loadReferences();
    }
  }, [isExpanded, topic.id]);

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

  return (
    <div
      className="topic-block"
      style={{
        left: `${topic.position_x}px`,
        top: `${topic.position_y}px`,
      }}
    >
      <div className="topic-header">
        <h3 onClick={() => setIsExpanded(!isExpanded)}>
          {topic.name}
        </h3>
        <button onClick={handleAddReference}>+</button>
      </div>

      <div className="references-container">
        {references.map((reference) => (
          <ReferenceNode
            key={reference.id}
            reference={reference}
            onUpdate={loadReferences}
          />
        ))}
      </div>

      {isAddingReference && (
        <NewReferenceForm
          topicId={topic.id}
          onCancel={() => setIsAddingReference(false)}
          onAdded={handleReferenceAdded}
        />
      )}
    </div>
  );
}

function NewReferenceForm({ topicId, onCancel, onAdded }) {
  const [formData, setFormData] = useState({
    title: '',
    doi: '',
    authors: '',
    abstract: '',
    notes: '',
  });

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

  return (
    <div className="reference-form">
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
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default TopicBlock;

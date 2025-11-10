import { useState, useEffect } from 'react';
import TopicBlock from './TopicBlock';
import './ProjectView.css';

function ProjectView({ project, onBack }) {
  const [topics, setTopics] = useState([]);
  const [newTopicName, setNewTopicName] = useState('');
  const [isAddingTopic, setIsAddingTopic] = useState(false);

  useEffect(() => {
    loadTopics();
  }, [project.id]);

  const loadTopics = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/projects/${project.id}/topics`);
      const data = await response.json();
      setTopics(data);
    } catch (error) {
      console.error('Failed to load topics:', error);
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
        }),
      });

      if (response.ok) {
        setNewTopicName('');
        setIsAddingTopic(false);
        loadTopics();
      }
    } catch (error) {
      console.error('Failed to create topic:', error);
    }
  };

  return (
    <div className="project-view">
      <div className="project-header">
        <button onClick={onBack}>← Back to Projects</button>
        <h2>{project.title}</h2>
        <button onClick={() => setIsAddingTopic(true)}>+ Add Topic</button>
      </div>

      {isAddingTopic && (
        <div className="add-topic-form">
          <input
            type="text"
            placeholder="Topic name..."
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddTopic()}
            autoFocus
          />
          <button onClick={handleAddTopic}>Add</button>
          <button onClick={() => setIsAddingTopic(false)}>Cancel</button>
        </div>
      )}

      <div className="canvas">
        {topics.map((topic) => (
          <TopicBlock
            key={topic.id}
            topic={topic}
            onUpdate={loadTopics}
          />
        ))}
      </div>
    </div>
  );
}

export default ProjectView;

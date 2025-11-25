import { useEffect, useRef, useState } from 'react';
import './WebPanel.css';

function WebPanel({ url, onClose, isAddingTopic }) {
  const webviewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    if (webviewRef.current && url) {
      // Set up webview event listeners
      const webview = webviewRef.current;

      const updateNavigationState = () => {
        setCanGoBack(webview.canGoBack());
        setCanGoForward(webview.canGoForward());
      };

      webview.addEventListener('did-fail-load', (e) => {
        console.error('Failed to load:', e);
      });

      webview.addEventListener('did-start-loading', () => {
        console.log('Started loading:', url);
      });

      webview.addEventListener('did-finish-load', () => {
        console.log('Finished loading:', url);
        updateNavigationState();
      });

      webview.addEventListener('did-navigate', () => {
        updateNavigationState();
      });

      webview.addEventListener('did-navigate-in-page', () => {
        updateNavigationState();
      });
    }
  }, [url]);

  const handleGoBack = () => {
    if (webviewRef.current && canGoBack) {
      webviewRef.current.goBack();
    }
  };

  const handleGoForward = () => {
    if (webviewRef.current && canGoForward) {
      webviewRef.current.goForward();
    }
  };

  if (!url) return null;

  const topPosition = isAddingTopic ? 140 : 75;

  return (
    <div className="web-panel" style={{ top: `${topPosition}px` }}>
      <div className="web-panel-header">
        <div className="web-panel-nav">
          <button
            className="nav-btn"
            onClick={handleGoBack}
            disabled={!canGoBack}
            title="Go back"
          >
            ←
          </button>
          <button
            className="nav-btn"
            onClick={handleGoForward}
            disabled={!canGoForward}
            title="Go forward"
          >
            →
          </button>
        </div>
        <h4>Google Scholar</h4>
        <div className="web-panel-actions">
          <button
            className="external-link-btn"
            onClick={() => window.open(url, '_blank')}
            title="Open in browser"
          >
            ↗
          </button>
          <button
            className="close-btn"
            onClick={onClose}
            title="Close panel"
          >
            ×
          </button>
        </div>
      </div>
      <webview
        ref={webviewRef}
        src={url}
        className="web-panel-iframe"
        useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      />
    </div>
  );
}

export default WebPanel;

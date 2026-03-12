import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import './WebPanel.css';

const WebPanel = forwardRef(function WebPanel({ url, onClose, isAddingTopic, hidden }, ref) {
  const webviewRef = useRef(null);
  const panelRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [pageTitle, setPageTitle] = useState('Google Scholar');
  const [panelWidth, setPanelWidth] = useState(null);

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

      webview.addEventListener('did-finish-load', () => {
        updateNavigationState();
      });

      webview.addEventListener('did-navigate', () => {
        updateNavigationState();
      });

      webview.addEventListener('did-navigate-in-page', () => {
        updateNavigationState();
      });

      webview.addEventListener('page-title-updated', (e) => {
        if (e.title) {
          setPageTitle(e.title);
        }
      });
    }
  }, [url]);

  // Expose scraping methods to parent components
  useImperativeHandle(ref, () => ({
    // Wait for the webview to load Scholar results (polls until found or timeout)
    waitForResults: async (searchQuery, timeoutMs = 15000) => {
      const start = Date.now();

      // Wait for webview element to exist (component may need to mount first)
      while (!webviewRef.current && Date.now() - start < timeoutMs) {
        await new Promise(r => setTimeout(r, 200));
      }

      // Initial delay to let React re-render and webview start navigating
      await new Promise(r => setTimeout(r, 1000));

      // Poll until Scholar results matching our query appear
      while (Date.now() - start < timeoutMs) {
        const webview = webviewRef.current;
        if (!webview) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        try {
          const ready = await webview.executeJavaScript(`
            (() => {
              // Check URL contains our search and results exist
              const hasResults = !!document.querySelector('#gs_res_ccl_mid .gs_r.gs_or.gs_scl');
              const isScholarSearch = window.location.href.includes('scholar.google.com/scholar?');
              return hasResults && isScholarSearch;
            })()
          `);
          if (ready) return true;
        } catch (e) {
          // webview not ready or page still loading
        }
        await new Promise(r => setTimeout(r, 500));
      }
      return false;
    },

    scrapeScholarResults: async () => {
      const webview = webviewRef.current;
      if (!webview) return { papers: [], nav: { hasNextPage: false, hasPrevPage: false } };

      try {
        const results = await webview.executeJavaScript(`
          (() => {
            const results = [];
            const container = document.querySelector('#gs_res_ccl_mid');
            if (!container) return { papers: results, nav: { hasNextPage: false, hasPrevPage: false } };

            container.querySelectorAll('.gs_r.gs_or.gs_scl').forEach(el => {
              const ri = el.querySelector('.gs_ri');
              if (!ri) return;

              // Title and DOI/href from .gs_rt
              const rtEl = ri.querySelector('.gs_rt');
              const titleLink = rtEl ? rtEl.querySelector('a') : null;
              const title = titleLink ? titleLink.textContent : (rtEl ? rtEl.textContent : '');
              const titleHtml = titleLink ? titleLink.innerHTML : (rtEl ? rtEl.innerHTML : '');
              const href = titleLink ? titleLink.href : '';
              const cid = el.getAttribute('data-cid');

              // Authors from .gs_a (everything before the first " - ")
              const gsA = ri.querySelector('.gs_a');
              let authors = '', year = '';
              if (gsA) {
                const metaText = gsA.textContent;
                const parts = metaText.split(' - ');
                authors = (parts[0] || '').trim();
                // Year: look for 4-digit number in the full meta text
                const yearMatch = metaText.match(/(\\d{4})/);
                year = yearMatch ? yearMatch[1] : '';
              }

              // Citation count from .gs_fl.gs_flb
              let citationCount = 0;
              const flEl = ri.querySelector('.gs_fl.gs_flb');
              if (flEl) {
                flEl.querySelectorAll('a').forEach(a => {
                  const txt = a.textContent;
                  const match = txt.match(/(?:Cited by|Citato da)\\s+(\\d+)/);
                  if (match) citationCount = parseInt(match[1]);
                });
              }

              // Snippet from .gs_rs
              const snippetEl = ri.querySelector('.gs_rs');
              const snippet = snippetEl ? snippetEl.textContent : '';

              if (title) {
                results.push({ title, titleHtml, href, authors, year, snippet, citationCount, cid });
              }
            });

            // Check for next/prev page links
            const navInfo = { hasNextPage: false, hasPrevPage: false };
            const nextBtn = document.querySelector('.gs_ico_nav_next');
            if (nextBtn && nextBtn.closest('a')) navInfo.hasNextPage = true;
            const prevBtn = document.querySelector('.gs_ico_nav_previous');
            if (prevBtn && prevBtn.closest('a')) navInfo.hasPrevPage = true;

            return { papers: results, nav: navInfo };
          })()
        `);
        return results || { papers: [], nav: { hasNextPage: false, hasPrevPage: false } };
      } catch (error) {
        console.error('Failed to scrape Scholar results:', error);
        return { papers: [], nav: { hasNextPage: false, hasPrevPage: false } };
      }
    },

    // Navigate to next or previous Scholar results page
    navigateScholarPage: async (direction) => {
      const webview = webviewRef.current;
      if (!webview) return false;

      try {
        const clicked = await webview.executeJavaScript(`
          (() => {
            const iconClass = ${direction === 'next' ? "'gs_ico_nav_next'" : "'gs_ico_nav_previous'"};
            const icon = document.querySelector('.' + iconClass);
            if (icon) {
              const link = icon.closest('a') || icon.closest('button');
              if (link) { link.click(); return true; }
            }
            return false;
          })()
        `);

        if (!clicked) return false;

        // Wait for the new page to load
        await new Promise((resolve) => {
          const timeout = setTimeout(resolve, 10000);
          const onLoad = () => {
            webview.removeEventListener('did-finish-load', onLoad);
            clearTimeout(timeout);
            setTimeout(resolve, 800);
          };
          webview.addEventListener('did-finish-load', onLoad);
        });

        return true;
      } catch (e) {
        console.error('Failed to navigate Scholar page:', e);
        return false;
      }
    },

    // Navigate Scholar to search for an exact title, wait for load, then scrape abstract + BibTeX
    searchAndScrapeDetails: async (title) => {
      const webview = webviewRef.current;
      if (!webview || !title) return { abstract: '', bibtex: '' };

      // Navigate to exact title search
      const exactQuery = `"${title}"`;
      const searchUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(exactQuery)}`;
      webview.loadURL(searchUrl);

      // Wait for the page to load
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 12000);
        const onLoad = () => {
          webview.removeEventListener('did-finish-load', onLoad);
          clearTimeout(timeout);
          setTimeout(resolve, 800);
        };
        webview.addEventListener('did-finish-load', onLoad);
      });

      // Scrape abstract from the detailed view: gs_fma_snp
      let abstract = '';
      try {
        abstract = await webview.executeJavaScript(`
          (() => {
            // Full abstract path: gs_ri -> gs_fma_p -> gs_fma_wpr -> gs_fma_abs -> gs_fma_snp
            const snp = document.querySelector('.gs_fma_snp');
            if (snp) return snp.textContent.trim();
            // Fallback: try .gs_rs snippet
            const rs = document.querySelector('.gs_rs');
            return rs ? rs.textContent.trim() : '';
          })()
        `) || '';
      } catch (e) {
        console.error('Abstract scrape error:', e);
      }

      // Grab BibTeX: click Cite button, wait for popup, click BibTeX link to navigate there
      let bibtex = '';
      try {
        // Step 1: Click Cite and get the BibTeX page URL
        const bibUrl = await webview.executeJavaScript(`
          (async () => {
            try {
              const citeBtn = document.querySelector('.gs_or_cit.gs_or_btn');
              if (!citeBtn) return null;
              citeBtn.click();

              // Wait for the cite popup to appear
              for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 200));
                const popup = document.querySelector('#gs_citi');
                if (popup) {
                  const links = popup.querySelectorAll('a');
                  for (const link of links) {
                    if (link.textContent.includes('BibTeX')) {
                      const url = link.href;
                      // Close the popup
                      const closeBtn = document.querySelector('#gs_cit-x');
                      if (closeBtn) closeBtn.click();
                      return url;
                    }
                  }
                  const closeBtn = document.querySelector('#gs_cit-x');
                  if (closeBtn) closeBtn.click();
                  break;
                }
              }
              return null;
            } catch (e) {
              return null;
            }
          })()
        `);

        if (bibUrl) {
          // Step 2: Navigate webview to the BibTeX page
          webview.loadURL(bibUrl);

          // Step 3: Wait for page to load
          await new Promise((resolve) => {
            const timeout = setTimeout(resolve, 8000);
            const onLoad = () => {
              webview.removeEventListener('did-finish-load', onLoad);
              clearTimeout(timeout);
              setTimeout(resolve, 300);
            };
            webview.addEventListener('did-finish-load', onLoad);
          });

          // Step 4: Read entire page text — the whole page IS the BibTeX
          bibtex = await webview.executeJavaScript(`
            document.body.innerText.trim()
          `) || '';

          // Step 5: Navigate back so Scholar is visible again
          webview.goBack();
        }
      } catch (e) {
        console.error('BibTeX fetch error:', e);
      }

      return { abstract, bibtex };
    },
  }));

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

  // Left-edge drag-to-resize
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = panelRef.current?.offsetWidth || 600;

    const onMouseMove = (ev) => {
      const delta = startX - ev.clientX;
      const newWidth = Math.max(350, Math.min(startWidth + delta, window.innerWidth * 0.8));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    setPageTitle('Google Scholar');
  }, [url]);

  if (!url) return null;

  const topPosition = isAddingTopic ? 140 : 75;
  const panelStyle = {
    top: `${topPosition}px`,
    bottom: '50px',
    ...(panelWidth ? { width: `${panelWidth}px` } : {}),
  };

  return (
    <div ref={panelRef} className={`web-panel ${hidden ? 'web-panel-hidden' : ''}`} style={panelStyle}>
      <div className="web-panel-resize-handle" onMouseDown={handleResizeStart} />
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
        <h4 title={pageTitle}>{pageTitle}</h4>
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
      <div style={{ flex: 1, position: 'relative' }}>
        <webview
          ref={webviewRef}
          src={url}
          className="web-panel-iframe"
          useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        />
        {isResizing && <div style={{ position: 'absolute', inset: 0, cursor: 'ew-resize', zIndex: 20 }} />}
      </div>
    </div>
  );
});

export default WebPanel;

# Reference Manager

A desktop application for managing academic references. Built with Electron, React, and a Python/Flask backend with SQLite storage.

## Features

### Projects
Create separate projects for different research topics or papers. Each project has its own canvas with independent topics, references, and connections.

### Visual Canvas
An infinite, zoomable canvas where topic blocks are arranged freely on a snap-to-grid layout. Pan by scrolling, zoom with Ctrl+scroll or the bottom bar controls. A minimap in the bottom-right corner provides an overview and allows click-to-navigate.

### Topic Blocks
Draggable, resizable blocks that group related references. Each block has a colored header, a name, and contains reference nodes displayed as circles. Topics can be renamed, deleted, and reordered. The block auto-expands horizontally to fit long titles.

### References
Each reference stores title, authors, year, DOI, abstract, notes, citation count, and BibTeX. References appear as colored circles inside topic blocks. Clicking a reference opens a detail panel for viewing and editing. References can be reordered within a topic via drag-and-drop.

### Google Scholar Integration
An embedded Scholar browser panel opens on the right side of the canvas. When adding a reference, type a search query and the app automatically:
- Navigates to Google Scholar and waits for results
- Scrapes paper titles, authors, year, citation count, and snippets
- Presents results in a selectable list with page navigation (Previous/Next)
- On selection, fetches the full abstract and BibTeX entry from the paper's detail page
- Highlights papers already present in the project (green badge) and warns before duplicating

The Scholar panel is horizontally resizable and can be hidden/shown via a toggle button while keeping the webview alive for background scraping.

### Connections
Draw directional arrows between topic blocks to represent relationships (e.g., "builds on", "contradicts", "extends"). Each connection can have a text description. Hovering over an arrow shows a tooltip with edit and delete options. Arrows render above the canvas but allow clicks to pass through to buttons and references underneath.

### Multi-Selection
Hold Ctrl and click multiple topic blocks to select them. Dragging any selected block moves the entire group while preserving relative distances. Collision detection applies to all selected blocks collectively -- if any block in the group would overlap a non-selected block, the entire group stops.

### Export
Multiple export formats are available from the top bar:
- **BibTeX (.bib)**: all unique BibTeX entries across the project
- **CSV (.csv)**: tabular export of title, authors, year, DOI, notes, citation count
- **Markdown (.md)**: formatted reference list
- **Report**: configurable report with selectable sections (abstract, notes, connections, etc.)

## Setup

### Prerequisites

- Node.js 18+
- Python 3.8+

### Installation

```bash
npm install
pip install -r backend/requirements.txt
```

### Running

Start both processes in separate terminals:

```bash
npm run dev              # Electron + Vite dev server
python backend/main.py   # Flask API on port 5000
```

The Electron window opens automatically and connects to the local Flask backend.

## Project Structure

```
ReferenceManager/
├── electron/              # Electron main process
├── src/                   # React frontend
│   ├── components/
│   │   ├── ProjectList    # Project selection and creation
│   │   ├── ProjectView    # Canvas, sidebar, minimap, status bar
│   │   ├── TopicBlock     # Draggable topic with references and search
│   │   ├── ReferenceNode  # Reference circle with tooltip
│   │   ├── ConnectionArrow # SVG arrows with hover tooltips
│   │   ├── ConnectionModal # Arrow description editor
│   │   ├── WebPanel       # Embedded Scholar browser with resize
│   │   └── ExportReportModal # Report configuration dialog
│   ├── App.jsx            # Root layout and global state
│   └── main.jsx           # Entry point
├── backend/               # Python Flask API
│   ├── api/routes.py      # REST endpoints
│   ├── models/            # SQLite models (project, topic, reference, connection)
│   ├── services/          # Scholar search via OpenAlex/pyalex
│   ├── database.py        # SQLite connection and schema init
│   └── main.py            # Flask server
├── requirements.txt       # Python dependencies
└── package.json           # Node dependencies and scripts
```

## Tech Stack

- **Frontend**: React 19, Vite, Electron
- **Backend**: Python, Flask, Flask-CORS
- **Database**: SQLite (file-based, no setup needed)
- **Scholar data**: pyalex (OpenAlex API), embedded Chromium webview for Google Scholar

## Building

```bash
npm run build
npm run package
```

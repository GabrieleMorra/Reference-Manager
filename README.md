# Reference Manager

A desktop application for PhD students to manage references for articles and dissertations.

## Features

- Create and manage multiple projects
- Organize references by topics
- Store reference metadata (title, DOI, authors, abstract)
- Add personal notes to references
- Visual topic blocks with reference nodes

## Setup

### Prerequisites

- Node.js 18+
- Python 3.8+

### Installation

1. Install Node.js dependencies:
```bash
npm install
```

2. Install Python dependencies:
```bash
pip install -r backend/requirements.txt
```

### Running the Application

1. Start the development server:
```bash
npm run dev
```

2. In a separate terminal, start the Python backend:
```bash
python backend/main.py
```

3. The application will open automatically in Electron

## Project Structure

```
ReferenceManager/
├── electron/           # Electron main process
├── src/               # React frontend
│   ├── components/    # UI components
│   └── main.jsx      # Application entry
├── backend/          # Python Flask API
│   ├── api/         # API routes
│   ├── models/      # Database models
│   └── main.py      # Flask server
└── database/        # SQLite database
```

## Building

To build the executable:
```bash
npm run build
npm run package
```

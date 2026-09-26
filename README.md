# Sentiment Analytics & AI Dashboard

SentimentPulse is a customer-feedback sentiment analytics dashboard. It analyzes individual reviews and CSV datasets, categorizes feedback by topic and urgency, and presents review, chatbot, and API activity through a browser-based admin console.

## Features

- **Sentiment classification:** Uses the Hugging Face Inference API with the `distilbert/distilbert-base-uncased-finetuned-sst-2-english` model when configured. If the API key is unavailable or inference fails, the app falls back to the local `sentiment` package.
- **Support chatbot:** Submit feedback in the assistant interface to receive a sentiment, topic, urgency, and rule-based product improvement recommendations. Responses are derived from the sentiment analysis and built-in guidance; this is not a generative LLM chatbot.
- **SQLite backend:** Stores users, sentiment history, chatbot logs, and API usage in a local SQLite database. The database and tables are initialized automatically, with sample records seeded on first startup.
- **Admin dashboard:** Browse and filter database tables and API usage summaries at `/admin`. The viewer refreshes automatically.
- **CSV analysis:** Analyze the bundled dataset or upload a CSV file for batch sentiment, topic, and urgency analysis.

## Tech Stack

- Node.js and Express 5
- SQLite (`sqlite3`)
- HTML, CSS, and browser JavaScript
- Hugging Face Inference API (`@huggingface/inference`)
- Local sentiment fallback (`sentiment`)

## Project Architecture

The Node.js server serves the web application from `public/`, exposes JSON endpoints, calls Hugging Face for sentiment classification when a key is configured, and persists activity through the SQLite module.

```text
.
├── server.js             # Express app, sentiment logic, API routes, and static pages
├── db.js                 # SQLite connection, schema, seed data, and persistence helpers
├── package.json          # Node.js dependencies and project metadata
├── data.json             # Small sample JSON data file
├── index.js              # Standalone Hugging Face dataset-analysis script
├── main.py               # Separate Streamlit/TextBlob sentiment prototype
├── dataset.csv/          # CSV datasets used by batch analysis
│   ├── sentiment.csv
│   ├── Equal.csv
│   └── RATIO.csv
├── public/
│   ├── index.html         # Main SentimentPulse user dashboard
│   └── admin.html         # Read-only database viewer interface
└── sentimentpulse.db     # Created automatically at runtime; SQLite database
```

The HTTP application is started by `server.js`. `index.js` is an optional standalone Hugging Face dataset script, and `main.py` is a separate prototype; neither is required to run the Express dashboard.

## Setup and Installation

### Prerequisites

- Node.js and npm
- A Hugging Face access token if you want to use hosted model inference. The local sentiment fallback works without it.

### Install dependencies

From the project root, run:

```bash
npm install
```

### Configure environment

Create a `.env` file in the project root. Hugging Face inference is optional; without a key, the app uses its local sentiment engine.

```dotenv
HUGGINGFACE_API_KEY=your_huggingface_access_token
PORT=3000
```

`PORT` is optional and defaults to `3000`. Keep `.env` private and do not commit access tokens.

### Start the application

```bash
node server.js
```

On startup, the server initializes the SQLite database and listens on the configured port. The database file `sentimentpulse.db` is created in the project root if it does not already exist.

## Local URLs

- **Main User App:** [http://localhost:3000](http://localhost:3000)
- **Admin Database Viewer:** [http://localhost:3000/admin](http://localhost:3000/admin)

If you set a different `PORT`, replace `3000` in these URLs with that port.

## Notes

- The admin page and its API endpoints are not protected by authentication. Run this project only in a trusted local or development environment; do not expose it publicly without adding access controls.
- The login and sign-up routes are demonstration flows and do not validate passwords against stored credentials.
- CSV batch processing expects review text columns such as `Summary`, `Review`, or `text`; uploaded files are limited to 25 MB, and batch analysis processes at most 30 rows per request.
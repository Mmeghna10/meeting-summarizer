# Recap — Meeting Summarizer

Transcribe meeting audio and generate action-oriented summaries automatically. Upload a recording, and Recap gives you a full transcript, a concise summary, key decisions, and clearly owned action items.

## Demo

https://drive.google.com/file/d/1g4AhaJ6ZhtU-VKEYVJ1SiJGW7keyrXNK/view?usp=sharing

## Features

- Upload meeting audio (`.mp3`, `.wav`, `.m4a`) through a clean web interface
- Automatic speech-to-text transcription using `faster-whisper` (runs locally, no external API cost)
- LLM-powered summarization that extracts:
  - A concise 3–5 sentence summary
  - Key decisions made during the meeting
  - Action items, tagged with the responsible person where mentioned
- Transcript and summary are persisted in a local database

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend | FastAPI (Python) |
| Speech-to-Text | faster-whisper (local, open-source) |
| LLM | Google Gemini (`gemini-3.6-flash`) |
| Database | SQLite |

## Architecture

```
[React Frontend]
   → Upload audio file
   → Display transcript + summary + action items

        ↓ (multipart/form-data)

[FastAPI Backend]
   POST /upload      → saves audio, runs faster-whisper → transcript
   POST /summarize    → sends transcript to Gemini → structured summary

        ↓

[SQLite Database]
   meetings(id, filename, transcript, summary, key_decisions, action_items, created_at)
```

## Setup Instructions

### Prerequisites
- Python 3.12
- Node.js (LTS)
- A free Google Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd meeting-summarizer
```

### 2. Backend setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
```

Create a `.env` file inside `backend/` with:
```
GEMINI_API_KEY=your_gemini_api_key_here
```

Run the backend:
```bash
uvicorn main:app --reload
```
Backend runs at `http://127.0.0.1:8000`. Interactive API docs available at `http://127.0.0.1:8000/docs`.

### 3. Frontend setup
Open a new terminal:
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:5173`.

### 4. Usage
1. Open `http://localhost:5173` in your browser
2. Drag and drop (or click to browse) a meeting audio file
3. Click **Process meeting**
4. View the transcript alongside the generated summary, key decisions, and action items

## Prompt Design

The summarization prompt explicitly instructs the LLM to return structured JSON, so the output can be reliably rendered in the UI without post-processing guesswork:

```
Summarize this meeting transcript into a concise summary, key decisions,
and action items (with owner names where mentioned). Return only valid JSON
in a fixed schema.
```

This was tested against both clean and rambling/unstructured transcripts to ensure consistent output quality.

## Project Structure
```
meeting-summarizer/
├── backend/
│   ├── main.py              # FastAPI app: upload, transcription, summarization
│   ├── requirements.txt
│   └── uploads/              # (gitignored) uploaded audio files
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Main UI: upload, results display
│   │   └── App.css
│   └── package.json
└── README.md
```

## Notes
- `faster-whisper` runs the `base` model locally on CPU — no external speech-to-text API keys or costs required.
- The Gemini API free tier is sufficient for running and demoing this project.

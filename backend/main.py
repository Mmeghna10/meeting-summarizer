from fastapi import FastAPI, UploadFile, File
from faster_whisper import WhisperModel
from fastapi.middleware.cors import CORSMiddleware
import os

import sqlite3

import google.generativeai as genai
from dotenv import load_dotenv
import json

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
gemini_model = genai.GenerativeModel("gemini-3.6-flash")


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the whisper model once when server starts (not on every request)
model = WhisperModel("base", device="cpu", compute_type="int8")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def init_db():
    conn = sqlite3.connect("meetings.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            transcript TEXT,
            summary TEXT,
            key_decisions TEXT,
            action_items TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_db()

@app.get("/")
def read_root():
    return {"message": "Meeting Summarizer backend is running!"}

@app.post("/upload")

async def upload_audio(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".mp3", ".wav", ".m4a")):
        return {"error": "Please upload a valid audio file (.mp3, .wav, .m4a)"}
    
    # Save uploaded file to disk
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Transcribe using faster-whisper
    segments, info = model.transcribe(file_path)
    transcript = " ".join([segment.text for segment in segments])

       # Save to database
    conn = sqlite3.connect("meetings.db")
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO meetings (filename, transcript) VALUES (?, ?)",
        (file.filename, transcript)
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()

    return {
        "id": new_id,
        "filename": file.filename,
        "language_detected": info.language,
        "transcript": transcript
    }

    

    

@app.post("/summarize")
async def summarize_transcript(meeting_id: int):
    conn = sqlite3.connect("meetings.db")
    cursor = conn.cursor()
    cursor.execute("SELECT transcript FROM meetings WHERE id = ?", (meeting_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return {"error": "Meeting not found"}

    transcript = row[0]

    prompt = f"""You are a meeting assistant. Given the following meeting transcript, extract:
1. A concise summary (3-5 sentences)
2. Key decisions made (bullet list)
3. Action items (bullet list, with owner name if mentioned, else "Unassigned")

Return ONLY valid JSON in this exact format, with no extra text before or after:
{{
  "summary": "...",
  "key_decisions": ["...", "..."],
  "action_items": ["...", "..."]
}}

Transcript:
\"\"\"
{transcript}
\"\"\"
"""

    response = gemini_model.generate_content(prompt)
    raw_text = response.text.strip()

    # Clean up if Gemini wraps the JSON in markdown code fences
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        raw_text = raw_text.replace("json", "", 1).strip()

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        conn.close()
        return {"error": "Failed to parse LLM response", "raw_response": raw_text}

    # Save results back to database
    cursor.execute(
        "UPDATE meetings SET summary = ?, key_decisions = ?, action_items = ? WHERE id = ?",
        (
            result.get("summary", ""),
            json.dumps(result.get("key_decisions", [])),
            json.dumps(result.get("action_items", [])),
            meeting_id
        )
    )
    conn.commit()
    conn.close()

    return result
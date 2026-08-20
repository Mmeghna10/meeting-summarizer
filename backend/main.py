from fastapi import FastAPI, UploadFile, File
from faster_whisper import WhisperModel
import os

import sqlite3


app = FastAPI()

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
    conn.close()

    return {
        "filename": file.filename,
        "language_detected": info.language,
        "transcript": transcript
    }
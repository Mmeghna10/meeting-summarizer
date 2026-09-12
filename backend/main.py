

from fastapi import FastAPI, UploadFile, File
from faster_whisper import WhisperModel
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
 
import sqlite3
 
import google.generativeai as genai
from dotenv import load_dotenv
import json
 
import chromadb
from sentence_transformers import SentenceTransformer
 
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
 
# ---- RAG setup ----
# Local embedding model (downloads ~90MB once, then runs fully offline)
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
 
# Persistent local vector database (stored in backend/chroma_db/)
chroma_client = chromadb.PersistentClient(path="chroma_db")
collection = chroma_client.get_or_create_collection(name="meetings")
 
 
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
    cursor.execute("SELECT transcript, filename FROM meetings WHERE id = ?", (meeting_id,))
    row = cursor.fetchone()
 
    if not row:
        conn.close()
        return {"error": "Meeting not found"}
 
    transcript, filename = row
 
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
 
    # ---- RAG: embed and store this transcript in the vector database ----
    embedding = embedding_model.encode(transcript).tolist()
    collection.upsert(
        ids=[str(meeting_id)],
        embeddings=[embedding],
        documents=[transcript],
        metadatas=[{"meeting_id": meeting_id, "filename": filename}]
    )
 
    return result
 
 
# ---- RAG Chatbot endpoint ----
class ChatRequest(BaseModel):
    question: str
 
 
@app.post("/chat")
async def chat_with_meetings(request: ChatRequest):
    question = request.question
 
    # Embed the question the same way transcripts were embedded
    question_embedding = embedding_model.encode(question).tolist()
 
    # Search the vector database for the most relevant past meeting chunks
    results = collection.query(
        query_embeddings=[question_embedding],
        n_results=3
    )
 
    retrieved_docs = results.get("documents", [[]])[0]
    retrieved_meta = results.get("metadatas", [[]])[0]
 
    if not retrieved_docs:
        return {"answer": "I don't have any meeting transcripts to search yet. Upload and summarize a meeting first."}
 
    # Build context from retrieved chunks, citing which meeting each came from
    context_blocks = []
    for doc, meta in zip(retrieved_docs, retrieved_meta):
        context_blocks.append(f"[Meeting: {meta.get('filename', 'unknown')}]\n{doc}")
    context = "\n\n".join(context_blocks)
 
    prompt = f"""You are a helpful assistant answering questions about past meetings.
Use ONLY the context below to answer the question. If the answer isn't in the context, say you don't have that information.
 
Context from relevant meetings:
\"\"\"
{context}
\"\"\"
 
Question: {question}
 
Answer clearly and concisely, mentioning which meeting the information came from if relevant.
"""
 
    response = gemini_model.generate_content(prompt)
    answer = response.text.strip()
 
    return {
        "answer": answer,
        "sources": [meta.get("filename", "unknown") for meta in retrieved_meta]
    }
 

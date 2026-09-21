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
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
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
    # New table: each action item tracked individually with a status
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS action_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id INTEGER,
            owner TEXT,
            task TEXT,
            status TEXT DEFAULT 'open',
            completed_via_meeting_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
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
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    segments, info = model.transcribe(file_path)
    transcript = " ".join([segment.text for segment in segments])

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
3. Action items - return each as an object with "owner" (the person's name if mentioned, else "Unassigned") and "task" (what needs to be done)

Return ONLY valid JSON in this exact format, with no extra text before or after:
{{
  "summary": "...",
  "key_decisions": ["...", "..."],
  "action_items": [
    {{"owner": "...", "task": "..."}}
  ]
}}

Transcript:
\"\"\"
{transcript}
\"\"\"
"""

    response = gemini_model.generate_content(prompt)
    raw_text = response.text.strip()

    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        raw_text = raw_text.replace("json", "", 1).strip()

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        conn.close()
        return {"error": "Failed to parse LLM response", "raw_response": raw_text}

    action_items = result.get("action_items", [])

    # Store a display-friendly string version on the meetings row (for the results panel)
    display_items = [f"{item.get('owner', 'Unassigned')}: {item.get('task', '')}" for item in action_items]

    cursor.execute(
        "UPDATE meetings SET summary = ?, key_decisions = ?, action_items = ? WHERE id = ?",
        (
            result.get("summary", ""),
            json.dumps(result.get("key_decisions", [])),
            json.dumps(display_items),
            meeting_id
        )
    )

    # Insert each action item as its own trackable row
    new_item_ids = []
    for item in action_items:
        cursor.execute(
            "INSERT INTO action_items (meeting_id, owner, task, status) VALUES (?, ?, ?, 'open')",
            (meeting_id, item.get("owner", "Unassigned"), item.get("task", ""))
        )
        new_item_ids.append(cursor.lastrowid)

    conn.commit()

    # ---- Accountability check: does this transcript complete any PREVIOUS open action items? ----
    cursor.execute(
        "SELECT id, owner, task FROM action_items WHERE status = 'open' AND meeting_id != ?",
        (meeting_id,)
    )
    previously_open = cursor.fetchall()

    auto_completed = []

    if previously_open:
        items_list_text = "\n".join(
            [f"id={item_id}: {owner} - {task}" for item_id, owner, task in previously_open]
        )

        check_prompt = f"""Here is a list of previously assigned, still-open action items from past meetings:

{items_list_text}

Here is a new meeting transcript:
\"\"\"
{transcript}
\"\"\"

Which of the above action items (by id) does this new transcript indicate have now been completed?
Only include an id if the transcript clearly states or strongly implies that specific task is done.
Return ONLY valid JSON in this exact format, with no extra text:
{{
  "completed_ids": [1, 2]
}}
If none appear completed, return {{"completed_ids": []}}.
"""

        check_response = gemini_model.generate_content(check_prompt)
        check_raw = check_response.text.strip()
        if check_raw.startswith("```"):
            check_raw = check_raw.strip("`")
            check_raw = check_raw.replace("json", "", 1).strip()

        try:
            check_result = json.loads(check_raw)
            completed_ids = check_result.get("completed_ids", [])
            for item_id in completed_ids:
                cursor.execute(
                    "UPDATE action_items SET status = 'done', completed_via_meeting_id = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (meeting_id, item_id)
                )
                auto_completed.append(item_id)
            conn.commit()
        except json.JSONDecodeError:
            pass  # if this check fails, we just skip auto-completion silently

    conn.close()

    # ---- RAG: embed and store this transcript in the vector database ----
    embedding = embedding_model.encode(transcript).tolist()
    collection.upsert(
        ids=[str(meeting_id)],
        embeddings=[embedding],
        documents=[transcript],
        metadatas=[{"meeting_id": meeting_id, "filename": filename}]
    )

    result["auto_completed_item_ids"] = auto_completed
    return result


@app.get("/action-items")
async def get_action_items(status: str = None):
    conn = sqlite3.connect("meetings.db")
    cursor = conn.cursor()

    if status:
        cursor.execute("""
            SELECT ai.id, ai.owner, ai.task, ai.status, ai.meeting_id, m.filename, ai.completed_via_meeting_id
            FROM action_items ai
            JOIN meetings m ON ai.meeting_id = m.id
            WHERE ai.status = ?
            ORDER BY ai.created_at DESC
        """, (status,))
    else:
        cursor.execute("""
            SELECT ai.id, ai.owner, ai.task, ai.status, ai.meeting_id, m.filename, ai.completed_via_meeting_id
            FROM action_items ai
            JOIN meetings m ON ai.meeting_id = m.id
            ORDER BY ai.created_at DESC
        """)

    rows = cursor.fetchall()
    conn.close()

    items = [
        {
            "id": r[0],
            "owner": r[1],
            "task": r[2],
            "status": r[3],
            "meeting_id": r[4],
            "meeting_filename": r[5],
            "completed_via_meeting_id": r[6],
        }
        for r in rows
    ]
    return {"action_items": items}


class StatusUpdate(BaseModel):
    status: str  # "open" or "done"


@app.patch("/action-items/{item_id}")
async def update_action_item(item_id: int, update: StatusUpdate):
    if update.status not in ("open", "done"):
        return {"error": "status must be 'open' or 'done'"}

    conn = sqlite3.connect("meetings.db")
    cursor = conn.cursor()

    if update.status == "done":
        cursor.execute(
            "UPDATE action_items SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (item_id,)
        )
    else:
        cursor.execute(
            "UPDATE action_items SET status = 'open', completed_at = NULL, completed_via_meeting_id = NULL WHERE id = ?",
            (item_id,)
        )

    conn.commit()
    conn.close()
    return {"success": True}


# ---- RAG Chatbot endpoint ----
class ChatRequest(BaseModel):
    question: str


@app.post("/chat")
async def chat_with_meetings(request: ChatRequest):
    question = request.question
    question_embedding = embedding_model.encode(question).tolist()

    results = collection.query(
        query_embeddings=[question_embedding],
        n_results=3
    )

    retrieved_docs = results.get("documents", [[]])[0]
    retrieved_meta = results.get("metadatas", [[]])[0]

    if not retrieved_docs:
        return {"answer": "I don't have any meeting transcripts to search yet. Upload and summarize a meeting first."}

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
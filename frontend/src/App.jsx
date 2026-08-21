import { useState, useRef } from 'react'
import './App.css'

const API_BASE = 'http://127.0.0.1:8000'

function Waveform({ active }) {
  const bars = Array.from({ length: 24 })
  return (
    <div className="waveform">
      {bars.map((_, i) => (
        <span
          key={i}
          className={`waveform-bar ${active ? 'waveform-bar-active' : ''}`}
          style={{ animationDelay: `${i * 0.045}s` }}
        />
      ))}
    </div>
  )
}

export default function App() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle | transcribing | summarizing | done | error
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const resetResults = () => {
    setTranscript('')
    setSummary(null)
    setErrorMsg('')
  }

  const handleFile = (selectedFile) => {
    if (!selectedFile) return
    const validTypes = ['.mp3', '.wav', '.m4a']
    const isValid = validTypes.some((ext) => selectedFile.name.toLowerCase().endsWith(ext))
    if (!isValid) {
      setStatus('error')
      setErrorMsg('Please choose an MP3, WAV, or M4A file.')
      return
    }
    setFile(selectedFile)
    resetResults()
    setStatus('idle')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  const processMeeting = async () => {
    if (!file) return
    resetResults()
    setStatus('transcribing')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      })
      const uploadData = await uploadRes.json()

      if (uploadData.error) {
        setStatus('error')
        setErrorMsg(uploadData.error)
        return
      }

      setTranscript(uploadData.transcript)
      setStatus('summarizing')

      // NOTE: assumes this is meeting id 1 for a fresh DB.
      // We'll wire this up properly once /upload returns the real id.
      const summarizeRes = await fetch(`${API_BASE}/summarize?meeting_id=${uploadData.id}`, {
        method: 'POST',
      })
      const summarizeData = await summarizeRes.json()

      if (summarizeData.error) {
        setStatus('error')
        setErrorMsg(summarizeData.error)
        return
      }

      setSummary(summarizeData)
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setErrorMsg('Could not reach the backend. Is the server running?')
    }
  }

  const isProcessing = status === 'transcribing' || status === 'summarizing'

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="brand">
            <span className="brand-mark" />
            <span className="brand-name">Recap</span>
          </div>
          <span className="navbar-tag">Meeting Summarizer</span>
        </div>
      </nav>

      <main className="main">
        <section className="hero">
          <p className="eyebrow">Audio in. Decisions out.</p>
          <h1 className="hero-title">
            Turn every recording into a record<br />someone can act on.
          </h1>
          <p className="hero-sub">
            Upload a meeting recording — Recap transcribes it, then pulls out
            the summary, decisions, and action items automatically.
          </p>
        </section>

        <section
          className={`dropzone ${isDragging ? 'dropzone-drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.m4a"
            hidden
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <Waveform active={isProcessing} />
          {file ? (
            <p className="dropzone-file">{file.name}</p>
          ) : (
            <>
              <p className="dropzone-title">Drop your meeting audio here</p>
              <p className="dropzone-sub">or click to browse — MP3, WAV, M4A</p>
            </>
          )}
        </section>

        <div className="actions">
          <button
            className="btn-primary"
            disabled={!file || isProcessing}
            onClick={processMeeting}
          >
            {status === 'transcribing' && 'Transcribing…'}
            {status === 'summarizing' && 'Summarizing…'}
            {(status === 'idle' || status === 'done' || status === 'error') && 'Process meeting'}
          </button>
          {status === 'error' && <p className="error-text">{errorMsg}</p>}
        </div>

        {status === 'done' && summary && (
          <section className="results">
            <div className="panel panel-transcript">
              <h2 className="panel-title">Transcript</h2>
              <p className="transcript-text">{transcript}</p>
            </div>

            <div className="panel panel-summary">
              <h2 className="panel-title">Summary</h2>
              <p className="summary-text">{summary.summary}</p>

              <h3 className="list-title list-title-decisions">Key decisions</h3>
              <ul className="pill-list">
                {summary.key_decisions?.map((item, i) => (
                  <li key={i} className="pill pill-decision">{item}</li>
                ))}
              </ul>

              <h3 className="list-title list-title-actions">Action items</h3>
              <ul className="pill-list">
                {summary.action_items?.map((item, i) => (
                  <li key={i} className="pill pill-action">{item}</li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <span>Recap — built for accurate, action-oriented meeting notes</span>
      </footer>
    </div>
  )
}
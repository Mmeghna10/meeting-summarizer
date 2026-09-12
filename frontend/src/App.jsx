import { useState, useRef, useEffect } from 'react'
import './App.css'

const API_BASE = 'http://127.0.0.1:8000'

function Waveform({ active, small }) {
  const bars = Array.from({ length: small ? 14 : 24 })
  return (
    <div className={`waveform ${small ? 'waveform-small' : ''}`}>
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

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="8" width="14" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9.5" cy="13.5" r="1.3" fill="currentColor" />
      <circle cx="14.5" cy="13.5" r="1.3" fill="currentColor" />
      <path d="M12 8V5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="3.5" r="1.4" fill="currentColor" />
      <path d="M5 12H3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M21 12h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 12l16-7-6 16-2.5-6.5L4 12z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const historyRef = useRef(null)

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight
    }
  }, [messages, isAsking])

  const sendQuestion = async () => {
    const question = input.trim()
    if (!question || isAsking) return

    setMessages((prev) => [...prev, { role: 'user', text: question }])
    setInput('')
    setIsAsking(true)

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()
      const cleanAnswer = (data.answer || '').replace(/\*\*/g, '')
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: cleanAnswer, sources: data.sources },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Could not reach the backend. Is the server running?' },
      ])
    } finally {
      setIsAsking(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendQuestion()
    }
  }

  return (
    <>
      {isOpen && (
        <div className="bot-window">
          <div className="bot-header">
            <div className="bot-header-info">
              <span className="bot-avatar"><BotIcon /></span>
              <div>
                <p className="bot-name">Recap Assistant</p>
                <p className="bot-status">
                  <span className="bot-status-dot" />
                  Online — ask about your meetings
                </p>
              </div>
            </div>
            <button className="bot-close-btn" onClick={() => setIsOpen(false)} aria-label="Close chat">
              <CloseIcon />
            </button>
          </div>

          <div className="bot-history" ref={historyRef}>
            {messages.length === 0 && (
              <div className="bot-welcome">
                <span className="bot-avatar bot-avatar-lg"><BotIcon /></span>
                <p className="bot-welcome-text">
                  Hi! I can answer questions using everything you've uploaded so far.
                </p>
                <p className="bot-welcome-example">Try: "What did we decide about the launch date?"</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bot-bubble-row bot-bubble-row-${m.role}`}>
                {m.role === 'assistant' && (
                  <span className="bot-avatar bot-avatar-sm"><BotIcon /></span>
                )}
                <div className={`bot-bubble bot-bubble-${m.role}`}>
                  <p className="bot-bubble-text">{m.text}</p>
                  {m.sources && m.sources.length > 0 && (
                    <p className="bot-sources">Source: {m.sources.join(', ')}</p>
                  )}
                </div>
              </div>
            ))}
            {isAsking && (
              <div className="bot-bubble-row bot-bubble-row-assistant">
                <span className="bot-avatar bot-avatar-sm"><BotIcon /></span>
                <div className="bot-bubble bot-bubble-assistant bot-bubble-typing">
                  <Waveform active small />
                </div>
              </div>
            )}
          </div>

          <div className="bot-input-row">
            <input
              className="bot-input"
              type="text"
              placeholder="Ask a question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isAsking}
              autoFocus
            />
            <button
              className="bot-send-btn"
              onClick={sendQuestion}
              disabled={isAsking || !input.trim()}
              aria-label="Send"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      <button
        className={`bot-fab ${isOpen ? 'bot-fab-open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? <CloseIcon /> : <BotIcon />}
      </button>
    </>
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

      <ChatWidget />
    </div>
  )
}

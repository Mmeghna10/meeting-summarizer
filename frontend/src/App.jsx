import { useState, useRef, useEffect } from 'react'
import { jsPDF } from 'jspdf'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'

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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 14l-4-4 4-4M5 10h9a5 5 0 010 10h-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4M5 16v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="4" cy="6" r="1.4" fill="currentColor" />
      <circle cx="4" cy="12" r="1.4" fill="currentColor" />
      <circle cx="4" cy="18" r="1.4" fill="currentColor" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4v11M12 15l-4-4M12 15l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function generateMeetingPDF({ filename, transcript, summary }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 48
  const maxWidth = pageWidth - margin * 2
  let y = 56

  const amber = [232, 163, 61]
  const ink = [18, 24, 31]
  const slate = [110, 122, 134]

  // Header
  doc.setFillColor(...amber)
  doc.rect(margin, y - 20, 10, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...ink)
  doc.text('Recap', margin + 18, y - 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...slate)
  doc.text('Meeting Summary Report', margin + 18, y + 2)

  y += 30
  doc.setDrawColor(225, 225, 225)
  doc.line(margin, y, pageWidth - margin, y)
  y += 24

  const addSectionTitle = (title, color) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...color)
    doc.text(title.toUpperCase(), margin, y)
    y += 16
  }

  const addWrappedText = (text, size = 10.5, color = ink) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(text, maxWidth)
    lines.forEach((line) => {
      if (y > 780) {
        doc.addPage()
        y = 56
      }
      doc.text(line, margin, y)
      y += size * 1.5
    })
    y += 8
  }

  // Meeting file
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...slate)
  doc.text(`Source file: ${filename}`, margin, y)
  y += 26

  // Summary
  addSectionTitle('Summary', ink)
  addWrappedText(summary.summary || 'No summary available.')

  // Key decisions
  addSectionTitle('Key Decisions', [91, 141, 190])
  const decisions = summary.key_decisions || []
  if (decisions.length === 0) {
    addWrappedText('No key decisions recorded.')
  } else {
    decisions.forEach((d) => addWrappedText(`•  ${d}`))
  }

  // Action items
  addSectionTitle('Action Items', [79, 157, 105])
  const items = summary.action_items || []
  if (items.length === 0) {
    addWrappedText('No action items recorded.')
  } else {
    items.forEach((item) => {
      const line = typeof item === 'string' ? item : `${item.owner}: ${item.task}`
      addWrappedText(`•  ${line}`)
    })
  }

  // Transcript (on a fresh page for readability)
  doc.addPage()
  y = 56
  addSectionTitle('Full Transcript', slate)
  doc.setFont('courier', 'normal')
  addWrappedText(transcript || 'No transcript available.', 9.5, [70, 78, 88])

  const safeName = (filename || 'meeting').replace(/\.[^/.]+$/, '')
  doc.save(`${safeName}-recap-report.pdf`)
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

function UploadView() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [processedFilename, setProcessedFilename] = useState('')
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
      setProcessedFilename(file.name)
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setErrorMsg('Could not reach the backend. Is the server running?')
    }
  }

  const isProcessing = status === 'transcribing' || status === 'summarizing'

  return (
    <>
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
        className={`dropzone ${isDragging ? 'dropzone-drag' : ''} ${file ? 'dropzone-filled' : ''}`}
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

        {status === 'done' && summary && (
          <button
            className="btn-secondary"
            onClick={() => generateMeetingPDF({ filename: processedFilename, transcript, summary })}
          >
            <DownloadIcon />
            Download PDF report
          </button>
        )}

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
                <li key={i} className="pill pill-action">
                  {typeof item === 'string' ? item : `${item.owner}: ${item.task}`}
                </li>
              ))}
            </ul>

            {summary.auto_completed_item_ids && summary.auto_completed_item_ids.length > 0 && (
              <p className="auto-complete-note">
                <CheckIcon />
                This meeting also confirmed {summary.auto_completed_item_ids.length} previous
                action item{summary.auto_completed_item_ids.length > 1 ? 's' : ''} as done — check the Action Items tab.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  )
}

function ActionItemsView() {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const fetchItems = async () => {
    setIsLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch(`${API_BASE}/action-items`)
      const data = await res.json()
      setItems(data.action_items || [])
    } catch (err) {
      setErrorMsg('Could not reach the backend. Is the server running?')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  const toggleStatus = async (item) => {
    const newStatus = item.status === 'open' ? 'done' : 'open'
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i))
    )
    try {
      await fetch(`${API_BASE}/action-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
    } catch (err) {
      fetchItems()
    }
  }

  const filteredItems = items.filter((i) => filter === 'all' || i.status === filter)
  const openCount = items.filter((i) => i.status === 'open').length
  const doneCount = items.filter((i) => i.status === 'done').length
  const completionRate = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0

  return (
    <section className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Action Items</h1>
          <p className="dashboard-sub">
            Tracked automatically across every meeting you process — including when a later
            meeting confirms something got done.
          </p>
        </div>
        <div className="dashboard-stats">
          <div className="stat-card">
            <p className="stat-number stat-open">{openCount}</p>
            <p className="stat-label">Open</p>
          </div>
          <div className="stat-card">
            <p className="stat-number stat-done">{doneCount}</p>
            <p className="stat-label">Done</p>
          </div>
          <div className="stat-card stat-card-rate">
            <p className="stat-number stat-rate">{completionRate}%</p>
            <p className="stat-label">Completion</p>
          </div>
        </div>
      </div>

      <div className="filter-row">
        {['all', 'open', 'done'].map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'filter-btn-active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="dashboard-loading">
          <Waveform active small />
        </div>
      )}
      {errorMsg && <p className="error-text">{errorMsg}</p>}

      {!isLoading && filteredItems.length === 0 && (
        <p className="dashboard-empty">No action items here yet — process a meeting to get started.</p>
      )}

      <div className="item-list">
        {filteredItems.map((item) => (
          <div key={item.id} className={`item-row ${item.status === 'done' ? 'item-row-done' : ''}`}>
            <button
              className={`item-toggle ${item.status === 'done' ? 'item-toggle-done' : ''}`}
              onClick={() => toggleStatus(item)}
              aria-label={item.status === 'done' ? 'Mark as open' : 'Mark as done'}
            >
              {item.status === 'done' ? <CheckIcon /> : <UndoIcon />}
            </button>
            <div className="item-content">
              <p className="item-task">
                <span className="item-owner">{item.owner}</span> — {item.task}
              </p>
              <p className="item-meta">
                From: {item.meeting_filename}
                {item.completed_via_meeting_id && (
                  <span className="item-meta-confirmed"> · confirmed done in meeting #{item.completed_via_meeting_id}</span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function App() {
  const [tab, setTab] = useState('upload')

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="brand">
            <span className="brand-mark" />
            <span className="brand-name">Recap</span>
          </div>
          <div className="tab-switch">
            <button
              className={`tab-btn ${tab === 'upload' ? 'tab-btn-active' : ''}`}
              onClick={() => setTab('upload')}
            >
              <UploadIcon />
              Upload
            </button>
            <button
              className={`tab-btn ${tab === 'actions' ? 'tab-btn-active' : ''}`}
              onClick={() => setTab('actions')}
            >
              <ListIcon />
              Action Items
            </button>
          </div>
        </div>
      </nav>

      <main className="main">
        {tab === 'upload' ? <UploadView /> : <ActionItemsView />}
      </main>

      <footer className="footer">
        <span>Recap — built for accurate, action-oriented meeting notes</span>
      </footer>

      <ChatWidget />
    </div>
  )
}

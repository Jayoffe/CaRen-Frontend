import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { sendChatMessage } from '../Services/API/aiAPI.js'
import MarkdownMessage from './MarkdownMessage.jsx'
import './ChatWidget.css'

const WELCOME_MESSAGE = 'Hi! I’m the DriveRent AI assistant. Ask me about rentals, vehicle features, or general maintenance.'

const POSITION_KEY = 'driverent-chat-position'
const LAUNCHER_SIZE = 58
const EDGE_MARGIN = 8
const WINDOW_GAP = 14
const DRAG_THRESHOLD = 5
const KEY_STEP = 16
const KEY_STEPS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

function viewportSize() {
  return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
}

function limit(value, max) {
  return Math.min(Math.max(value, EDGE_MARGIN), Math.max(max, EDGE_MARGIN))
}

function keepInView(position, viewport) {
  return {
    x: limit(position.x, viewport.width - LAUNCHER_SIZE - EDGE_MARGIN),
    y: limit(position.y, viewport.height - LAUNCHER_SIZE - EDGE_MARGIN),
  }
}

function loadPosition() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(POSITION_KEY))
    return Number.isFinite(saved?.x) && Number.isFinite(saved?.y) ? { x: saved.x, y: saved.y } : null
  } catch {
    return null
  }
}

function savePosition(position) {
  try {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify(position))
  } catch {
    // The button still moves; it just returns to its default spot next time.
  }
}

/** Where the chat window fits beside the button, or where it least obstructs if it fits nowhere. */
function placeChatWindow(launcher, chatWindow, viewport) {
  const { x, y } = launcher
  const { width, height } = chatWindow
  const maxLeft = viewport.width - width - EDGE_MARGIN
  const maxTop = viewport.height - height - EDGE_MARGIN
  const onRightSide = x + LAUNCHER_SIZE / 2 > viewport.width / 2
  const inLowerHalf = y + LAUNCHER_SIZE / 2 > viewport.height / 2
  const alignedLeft = limit(onRightSide ? x + LAUNCHER_SIZE - width : x, maxLeft)
  const alignedTop = limit(inLowerHalf ? y + LAUNCHER_SIZE - height : y, maxTop)

  const above = { left: alignedLeft, top: y - WINDOW_GAP - height }
  const below = { left: alignedLeft, top: y + LAUNCHER_SIZE + WINDOW_GAP }
  const toLeft = { left: x - WINDOW_GAP - width, top: alignedTop }
  const toRight = { left: x + LAUNCHER_SIZE + WINDOW_GAP, top: alignedTop }
  const candidates = [
    ...(inLowerHalf ? [above, below] : [below, above]),
    ...(onRightSide ? [toLeft, toRight] : [toRight, toLeft]),
  ]
  const fits = candidates.find(({ left, top }) => left >= EDGE_MARGIN && top >= EDGE_MARGIN && left <= maxLeft && top <= maxTop)
  return fits ? { ...fits, coversLauncher: false } : { left: alignedLeft, top: alignedTop, coversLauncher: true }
}

export default function ChatWidget({ user }) {
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([{ role: 'assistant', content: WELCOME_MESSAGE }])
  const [conversationId, setConversationId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [serviceStatus, setServiceStatus] = useState('unknown')
  const [requestError, setRequestError] = useState(null)
  const conversationRef = useRef(null)
  const inputRef = useRef(null)
  const rootRef = useRef(null)
  const windowRef = useRef(null)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const [savedPosition, setSavedPosition] = useState(loadPosition)
  const [dragging, setDragging] = useState(false)
  const [viewport, setViewport] = useState(viewportSize)
  const position = savedPosition && keepInView(savedPosition, viewport)
  const positionX = position?.x
  const positionY = position?.y

  useEffect(() => {
    if (open && !minimized) {
      conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [messages, open, minimized, loading])

  useEffect(() => {
    const updateViewport = () => setViewport(viewportSize())
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  // Styles are set directly because the size to fit around is only known once the window is on screen.
  useLayoutEffect(() => {
    const root = rootRef.current
    const chatWindow = windowRef.current
    if (!root) return undefined
    let coversLauncher = false
    if (chatWindow && positionX === undefined) {
      chatWindow.removeAttribute('style')
    } else if (chatWindow) {
      const placement = placeChatWindow(
        { x: positionX, y: positionY },
        { width: chatWindow.offsetWidth, height: chatWindow.offsetHeight },
        viewport,
      )
      coversLauncher = placement.coversLauncher
      Object.assign(chatWindow.style, {
        position: 'fixed',
        left: `${placement.left}px`,
        top: `${placement.top}px`,
        right: 'auto',
        bottom: 'auto',
      })
    }
    root.classList.toggle('dr-chat-covered', coversLauncher)
    return () => root.classList.remove('dr-chat-covered')
  }, [open, minimized, positionX, positionY, viewport])

  if (!user || !user.role) return null

  const startDrag = (event) => {
    suppressClickRef.current = false
    if (event.button !== 0) return
    const rect = rootRef.current.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
      last: null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return
    drag.moved = true
    drag.last = keepInView({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }, viewportSize())
    setDragging(true)
    setSavedPosition(drag.last)
  }

  const endDrag = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (!drag.moved) return
    suppressClickRef.current = true
    setDragging(false)
    savePosition(drag.last)
  }

  // Dragging needs a pointer, so the arrow keys offer the same move from the keyboard.
  const moveWithKeyboard = (event) => {
    const step = KEY_STEPS[event.key]
    if (!step) return
    event.preventDefault()
    const rect = rootRef.current.getBoundingClientRect()
    const distance = event.shiftKey ? KEY_STEP * 4 : KEY_STEP
    const next = keepInView({ x: rect.left + step[0] * distance, y: rect.top + step[1] * distance }, viewportSize())
    setSavedPosition(next)
    savePosition(next)
  }

  const toggleChat = (event) => {
    // A drag ends with a click on the button. Keyboard clicks (detail 0) are never part of a drag.
    if (event.detail !== 0 && suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    setOpen((current) => !current)
    setMinimized(false)
  }

  const sendMessage = async (event, retryText) => {
    event?.preventDefault()
    const retrying = typeof retryText === 'string'
    const text = (retrying ? retryText : message).trim()
    if (!text || loading) return

    if (!retrying) {
      setMessages((current) => [...current, { role: 'user', content: text }])
      setMessage('')
    }
    setRequestError(null)
    setLoading(true)
    try {
      const result = await sendChatMessage({
        message: text,
        conversation_id: conversationId,
      })
      setServiceStatus('online')
      setConversationId(result.conversation_id || null)
      setMessages((current) => [...current, { role: 'assistant', content: result.message }])
    } catch (error) {
      setServiceStatus('offline')
      setRequestError({
        message: error.message || 'I’m having trouble connecting right now. Please try again in a moment.',
        retryText: text,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className={`dr-chat${dragging ? ' dr-chat-dragging' : ''}`}
      style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}
    >
      {open && (
        <section ref={windowRef} className={`dr-chat-window${minimized ? ' dr-chat-window-minimized' : ''}`} aria-label="DriveRent customer service chat">
          <header className="dr-chat-header">
            <span className="dr-chat-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 13.5 5.6 8a2 2 0 0 1 1.9-1.4h9A2 2 0 0 1 18.4 8l1.6 5.5v5h-2v-2H6v2H4v-5.5Z" /><path d="M5 13.5h14M7 11h.01M17 11h.01" /></svg>
            </span>
            <span className="dr-chat-title"><strong>DriveRent AI assistant</strong><small>Rental and maintenance help</small><span className={`dr-chat-status dr-chat-status-${serviceStatus}`} aria-live="polite"><i />{serviceStatus === 'unknown' ? 'Status unknown' : serviceStatus === 'online' ? 'Online' : 'Offline'}</span></span>
            <div className="dr-chat-header-actions">
              <button type="button" onClick={() => setMinimized((current) => !current)} aria-label={minimized ? 'Expand chat' : 'Minimize chat'}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d={minimized ? 'M5 12h14M12 5l7 7-7 7' : 'M5 12h14'} /></svg>
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close chat">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
          </header>
          {!minimized && (
            <>
              <div className="dr-chat-messages" ref={conversationRef} role="log" aria-live="polite" aria-label="Conversation">
                {messages.map((item, index) => (
                  <div className={`dr-chat-row dr-chat-row-${item.role}`} key={`${index}-${item.role}`}>
                    <div className="dr-chat-bubble">
                      {item.role === 'assistant' ? <MarkdownMessage content={item.content} /> : item.content}
                    </div>
                  </div>
                ))}
                {requestError && (
                  <div className="dr-chat-error" role="alert">
                    <span>Message not sent. {requestError.message}</span>
                    <button type="button" onClick={() => sendMessage(null, requestError.retryText)} disabled={loading}>
                      Retry
                    </button>
                  </div>
                )}
                {loading && <div className="dr-chat-row dr-chat-row-assistant"><div className="dr-chat-bubble dr-chat-typing" role="status" aria-label="Assistant is responding"><i /><i /><i /></div></div>}
              </div>
              <form className="dr-chat-form" onSubmit={sendMessage}>
                <label className="dr-chat-input-label" htmlFor="dr-chat-input">Message</label>
                <textarea
                  id="dr-chat-input"
                  ref={inputRef}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      event.currentTarget.form.requestSubmit()
                    }
                  }}
                  placeholder="Ask about rentals or maintenance..."
                  rows={1}
                  maxLength={4000}
                  disabled={loading}
                />
                <button type="submit" aria-label="Send message" disabled={loading || !message.trim()}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" /></svg>
                </button>
              </form>
              <p className="dr-chat-note">Local AI assistance · Bookings aren’t created in chat</p>
            </>
          )}
        </section>
      )}
      <button
        className="dr-chat-launcher"
        type="button"
        title="Drag to move, or use the arrow keys"
        onClick={toggleChat}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={moveWithKeyboard}
        aria-label={open ? 'Close customer service chat' : 'Open customer service chat'}
        aria-expanded={open}
      >
        {open
          ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.4-3.1A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11h.01M12.5 11h.01M17 11h.01" /></svg>}
      </button>
    </div>
  )
}

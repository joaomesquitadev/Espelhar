import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { CHAT_COOLDOWN_MS } from '../lib/room.js'
import { playChatSound } from '../lib/sound.js'

const MAX_LENGTH = 500
const GROUP_GAP_MS = 5 * 60 * 1000

const time = (ts) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')

/**
 * Room chat. `meId` is 'host' for the host and the peer id for viewers; it only decides which lines are mine.
 * Lines from one person in a row share a header. The list sticks to the bottom unless the reader scrolled up;
 * then a pill offers the jump. A blip plays for lines from others.
 */
export default function Chat({ messages, meId, onSend }) {
  const [text, setText] = useState('')
  const [behind, setBehind] = useState(false)
  const [cooling, setCooling] = useState(false)
  const coolTimer = useRef(0)
  const list = useRef(null)
  const stick = useRef(true)
  const seen = useRef(null)

  useEffect(() => {
    const el = list.current
    const last = messages[messages.length - 1]
    const fresh = seen.current !== null && last && last.id !== seen.current
    if (fresh && last.fromId !== meId) playChatSound()
    if (el && stick.current) el.scrollTop = el.scrollHeight
    else if (fresh && last.fromId !== meId) setBehind(true)
    seen.current = last?.id ?? 0
  }, [messages, meId])

  function toBottom() {
    const el = list.current
    stick.current = true
    setBehind(false)
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  useEffect(() => () => clearTimeout(coolTimer.current), [])

  /** One message per pause: the host enforces the same rule, this just shows it. */
  function submit(event) {
    event.preventDefault()
    const clean = text.trim()
    if (!clean || cooling) return
    onSend(clean)
    setText('')
    setCooling(true)
    coolTimer.current = setTimeout(() => setCooling(false), CHAT_COOLDOWN_MS)
    toBottom()
  }

  return (
    <section className="chat" aria-label="Chat da sala">
      <h2 className="panel-title">
        <Icon name="chat" size={18} /> Chat
      </h2>
      <div className="chat-body">
        <ul
          className="chat-list"
          ref={list}
          role="log"
          aria-live="polite"
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            if (stick.current) setBehind(false)
          }}
        >
          {messages.length === 0 && (
            <li className="chat-empty">
              <Icon name="chat" size={22} />
              <span>Nenhuma mensagem ainda.</span>
              <span className="chat-empty-hint">Quem está na sala vê o que você escrever aqui.</span>
            </li>
          )}
          {messages.map((m, i) => {
            const prev = messages[i - 1]
            const mine = m.fromId === meId
            const head = !prev || prev.fromId !== m.fromId || m.ts - prev.ts > GROUP_GAP_MS
            return (
              <li key={m.id} className={`chat-line${mine ? ' chat-mine' : ''}${head ? ' chat-head-line' : ''}`}>
                {head && (
                  <span className="chat-head">
                    <span className="chat-from">{mine ? 'Você' : m.from || 'Participante'}</span>
                    {m.fromId === 'host' && !mine && <span className="tag tag-host">Anfitrião</span>}
                    <time className="chat-time">{time(m.ts)}</time>
                  </span>
                )}
                <span className="chat-text">{m.text}</span>
              </li>
            )
          })}
        </ul>
        {behind && (
          <button className="chat-new" type="button" onClick={toBottom}>
            Novas mensagens
          </button>
        )}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          className="chat-input"
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder={cooling ? 'Aguarde um instante…' : 'Escreva uma mensagem'}
          aria-label="Mensagem"
          autoComplete="off"
        />
        <button className="chat-send" type="submit" disabled={!text.trim() || cooling} aria-label="Enviar mensagem">
          <Icon name="send" size={18} />
        </button>
      </form>
    </section>
  )
}

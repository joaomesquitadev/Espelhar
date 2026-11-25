import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_QUALITY, applyQuality, captureScreen, tuneCall } from '../lib/media.js'
import { every } from '../lib/ticker.js'
import {
  CODE_LENGTH,
  cleanName,
  cleanPlace,
  cleanText,
  CHAT_COOLDOWN_MS,
  getPlace,
  knownPlace,
  normalizeCode,
  openHostPeer,
  placeFailure,
  sameSecret,
} from '../lib/room.js'

const MAX_WRONG_ATTEMPTS = 5 // per viewer
const MAX_FAILS_PER_MINUTE = 20 // across the whole room, so reconnecting does not reset the guessing budget
const MAX_VIEWERS = 30
const MAX_PASSWORD_LENGTH = 128
const MAX_MESSAGES = 40 // per connection, per MESSAGE_WINDOW_MS
const MESSAGE_WINDOW_MS = 5000
const OLD_PEER_GRACE_MS = 2500
const MAX_CHAT_LENGTH = 500
const MAX_CHAT_HISTORY = 100
const MAX_CHATS = 8 // per connection, per CHAT_WINDOW_MS
const CHAT_WINDOW_MS = 10000
const SWEEP_MS = 5000
const SILENCE_MS = 75000 // a viewer that says nothing for this long (no ping, every 5 s) is treated as gone
const NO_SOURCE = { active: false, byId: '', byName: '', audio: false }

function sharingInfo(s) {
  if (s.media) return { active: true, byId: 'host', byName: s.name || 'Anfitrião', audio: s.media.getAudioTracks().length > 0 }
  if (s.guest) {
    const byName = s.entries.get(s.guest.id)?.name ?? ''
    return { active: true, byId: s.guest.id, byName, audio: s.guest.stream.getAudioTracks().length > 0 }
  }
  return NO_SOURCE
}

/**
 * The room outlives any single broadcast: `status` is live while the room exists,
 * and `source` says who (host, a guest with permission, or nobody) is sharing right now.
 * status: idle | starting | live
 */
export function useHost() {
  const [status, setStatus] = useState('idle')
  const [code, setCode] = useState('')
  const [locked, setLocked] = useState(false)
  const [participants, setParticipants] = useState([])
  const [stream, setStream] = useState(null)
  const [source, setSource] = useState(NO_SOURCE)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [place, setPlace] = useState('')
  const [placeError, setPlaceError] = useState('')
  const [audioFailed, setAudioFailed] = useState(false)
  const [messages, setMessages] = useState([])
  const [quality, setQualityState] = useState(DEFAULT_QUALITY)
  const session = useRef(null)
  const actions = useRef({})

  /** Closes the room. Viewers are told first so they do not sit in a dead room; `immediate` is for a closing tab. */
  const stop = useCallback((options) => {
    const current = session.current
    session.current = null
    if (!current) return
    current.sweep?.()
    for (const entry of current.entries.values()) entry.conn.send({ type: 'closed' })
    current.media?.getTracks().forEach((track) => track.stop())
    if (options?.immediate === true) current.peer.destroy()
    else setTimeout(() => current.peer.destroy(), 300) // lets the goodbye leave before the connections drop
    setMessages([])
    setStatus('idle')
    setCode('')
    setLocked(false)
    setParticipants([])
    setStream(null)
    setSource(NO_SOURCE)
  }, [])

  /** Publishes the roster to React state and to every viewer. */
  const sync = useCallback(() => {
    const s = session.current
    if (!s) return
    const list = Array.from(s.entries, ([id, entry]) => ({
      id,
      name: entry.name,
      place: entry.place,
      mod: s.mods.has(id),
      share: s.sharers.has(id) || s.mods.has(id),
    }))
    setParticipants(list)
    for (const entry of s.entries.values()) entry.conn.send({ type: 'roster', host: s.name, hostPlace: s.place, list })
  }, [])

  /** Adds a chat line to the room history and delivers it to everyone, the author included. */
  const addChat = useCallback((s, fromId, from, text) => {
    const msg = { id: ++s.chatSeq, fromId, from, text, ts: Date.now() }
    s.chat.push(msg)
    if (s.chat.length > MAX_CHAT_HISTORY) s.chat.shift()
    setMessages([...s.chat])
    for (const entry of s.entries.values()) entry.conn.send({ type: 'chat', msg })
  }, [])

  const sendChat = useCallback(
    (text) => {
      const s = session.current
      const clean = cleanText(text, MAX_CHAT_LENGTH)
      if (s && clean) addChat(s, 'host', s.name || 'Anfitrião', clean)
    },
    [addChat],
  )

  /** Sends the current video to one viewer, replacing any earlier call to them. */
  const sendTo = useCallback((s, id, stream) => {
    s.calls.get(id)?.close()
    const call = s.peer.call(id, stream)
    s.calls.set(id, call)
    call.on('close', () => {
      if (s.calls.get(id) === call) s.calls.delete(id)
    })
    tuneCall(call, s.quality)
  }, [])

  /** Tells everyone what is being shown; `callAll` also (re)sends the video to every viewer. */
  const publish = useCallback((callAll = false) => {
    const s = session.current
    if (!s) return
    const current = s.media ?? s.guest?.stream ?? null
    const info = sharingInfo(s)
    setStream(current)
    setSource(info)
    for (const [id, entry] of s.entries) {
      entry.conn.send({ type: 'sharing', ...info })
      if (callAll && current && id !== s.guest?.id) sendTo(s, id, current)
    }
  }, [sendTo])

  const stopGuest = useCallback(
    (notify) => {
      const s = session.current
      const guest = s?.guest
      if (!guest) return
      s.guest = null
      guest.call.close()
      if (notify) s.entries.get(guest.id)?.conn.send({ type: 'stop-share' })
      publish()
    },
    [publish],
  )

  const stopSharing = useCallback(() => {
    const s = session.current
    if (!s?.media) return
    // Release the capture completely: a half-released system-audio device makes the next
    // "share with audio" fail with NotReadableError.
    const old = s.media
    old.getTracks().forEach((track) => {
      track.stop()
      old.removeTrack(track)
    })
    s.media = null
    for (const call of s.calls.values()) call.close()
    s.calls.clear()
    publish()
  }, [publish])

  const beginBroadcast = useCallback(
    (media) => {
      const s = session.current
      s.media?.getTracks().forEach((track) => track.stop())
      s.media = null
      if (s.guest) stopGuest(true)
      s.media = media
      media.getVideoTracks()[0].addEventListener('ended', () => {
        if (session.current?.media === media) stopSharing()
      })
      publish(true)
    },
    [publish, stopGuest, stopSharing],
  )

  const removeViewer = useCallback(
    (id) => {
      const s = session.current
      const entry = s?.entries.get(id)
      if (!entry) return
      if (s.guest?.id === id) stopGuest(false)
      s.entries.delete(id)
      s.mods.delete(id)
      s.sharers.delete(id)
      s.banned.add(id)
      entry.conn.send({ type: 'kicked' })
      setTimeout(() => entry.conn.close(), 300)
      sync()
    },
    [stopGuest, sync],
  )

  /** Removes a viewer who left, closed the tab or went silent. Unlike a kick, they may come back. */
  const dropViewer = useCallback(
    (id) => {
      const s = session.current
      const entry = s?.entries.get(id)
      if (!entry) return
      if (s.guest?.id === id) stopGuest(false)
      s.entries.delete(id)
      s.calls.get(id)?.close()
      s.calls.delete(id)
      entry.conn.close()
      sync()
    },
    [stopGuest, sync],
  )

  const setModerator = useCallback(
    (id, value) => {
      const s = session.current
      if (!s?.entries.has(id)) return
      if (value) s.mods.add(id)
      else {
        s.mods.delete(id)
        // Losing admin also ends a screen they were presenting under that permission.
        if (s.guest?.id === id && !s.sharers.has(id)) stopGuest(true)
      }
      sync()
    },
    [stopGuest, sync],
  )

  /** Lets (or stops letting) a participant present their own screen in this room. */
  const setSharer = useCallback(
    (id, value) => {
      const s = session.current
      if (!s?.entries.has(id)) return
      if (value) s.sharers.add(id)
      else {
        s.sharers.delete(id)
        if (s.guest?.id === id && !s.mods.has(id)) stopGuest(true)
      }
      sync()
    },
    [stopGuest, sync],
  )

  const attach = useCallback(
    (peer) => {
      peer.on('connection', (conn) => {
        const s = session.current
        if (!s) return
        const hits = []
        const chatHits = []

        // Everything below arrives from other people's browsers: check shape, cap size, limit rate.
        conn.on('data', (msg) => {
          const now = Date.now()
          while (hits.length && now - hits[0] > MESSAGE_WINDOW_MS) hits.shift()
          if (hits.push(now) > MAX_MESSAGES) return
          if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return

          const known = s.entries.get(conn.peer)
          if (known?.conn === conn) known.seen = now

          if (msg.type === 'ping') {
            conn.send({ type: 'pong' })
          } else if (msg.type === 'bye') {
            if (known?.conn === conn) dropViewer(conn.peer)
            else conn.close()
          } else if (msg.type === 'chat') {
            while (chatHits.length && now - chatHits[0] > CHAT_WINDOW_MS) chatHits.shift()
            const text = cleanText(msg.text, MAX_CHAT_LENGTH)
            const lastAt = chatHits[chatHits.length - 1] ?? 0
            const tooSoon = now - lastAt < CHAT_COOLDOWN_MS
            if (known?.conn === conn && text && !tooSoon && chatHits.length < MAX_CHATS) {
              chatHits.push(now)
              addChat(s, conn.peer, known.name, text)
            }
          } else if (msg.type === 'join') {
            if (s.banned.has(conn.peer)) {
              conn.send({ type: 'kicked' })
              setTimeout(() => conn.close(), 300)
              return
            }
            if (s.entries.get(conn.peer)?.conn === conn) return

            if (!s.entries.has(conn.peer) && s.entries.size >= MAX_VIEWERS) {
              conn.send({ type: 'denied', reason: 'full' })
              return
            }

            if (s.password) {
              const given = typeof msg.password === 'string' ? msg.password.slice(0, MAX_PASSWORD_LENGTH) : ''
              s.failLog = s.failLog.filter((t) => now - t < 60000)
              if (s.failLog.length >= MAX_FAILS_PER_MINUTE) {
                conn.send({ type: 'denied', reason: 'rate' })
                return
              }
              if ((s.fails.get(conn.peer) ?? 0) >= MAX_WRONG_ATTEMPTS) {
                conn.close()
                return
              }
              if (!sameSecret(given, s.password)) {
                if (given) {
                  s.failLog.push(now)
                  s.fails.set(conn.peer, (s.fails.get(conn.peer) ?? 0) + 1)
                }
                conn.send({ type: 'denied', reason: given ? 'wrong' : 'required' })
                return
              }
            }

            const viewerName = cleanName(msg.name)
            if (!viewerName) {
              conn.send({ type: 'denied', reason: 'name' })
              return
            }

            const previous = s.entries.get(conn.peer)
            s.entries.set(conn.peer, { conn, name: viewerName, place: cleanPlace(msg.place), seen: now })
            if (previous) previous.conn.close()
            conn.send({ type: 'granted' })
            conn.send({ type: 'chat-history', list: s.chat })
            sync()
            conn.send({ type: 'sharing', ...sharingInfo(s) })
            const current = s.media ?? s.guest?.stream
            if (current && s.guest?.id !== conn.peer) sendTo(s, conn.peer, current)
          } else if (msg.type === 'place') {
            const entry = s.entries.get(conn.peer)
            if (entry?.conn === conn) {
              entry.place = cleanPlace(msg.place)
              sync()
            }
          } else if (msg.type === 'share-stop') {
            if (s.guest?.id === conn.peer) stopGuest(false)
          } else if (s.entries.get(conn.peer)?.conn === conn && s.mods.has(conn.peer)) {
            // Admins can do what the host does, except touch the host or themselves.
            const target = typeof msg.target === 'string' ? msg.target : ''
            const others = target && target !== conn.peer
            if (msg.type === 'kick' && others) removeViewer(target)
            else if (msg.type === 'set-admin' && others) setModerator(target, Boolean(msg.value))
            else if (msg.type === 'set-sharer' && others) setSharer(target, Boolean(msg.value))
            else if (msg.type === 'stop-guest') stopGuest(true)
            else if (msg.type === 'change-code') {
              actions.current.changeCode(String(msg.code ?? '')).then((result) => {
                if (result.error) conn.send({ type: 'code-error', error: result.error })
              })
            }
          }
        })

        // A closed tab can leave the data channel hanging; a failed connection means the person is gone.
        conn.on('iceStateChanged', (state) => {
          if (state === 'failed' || state === 'closed') conn.close()
        })

        conn.on('close', () => {
          const entry = s.entries.get(conn.peer)
          if (entry?.conn === conn) {
            if (s.guest?.id === conn.peer) stopGuest(false)
            s.entries.delete(conn.peer)
            sync()
          }
        })
      })

      // A guest with permission sends its screen here; the host relays it to everyone else.
      peer.on('call', (call) => {
        const s = session.current
        if (!s) return
        const id = call.peer
        const entry = s.entries.get(id)
        const reason = !entry || !(s.sharers.has(id) || s.mods.has(id)) ? 'forbidden' : s.media || s.guest ? 'busy' : ''
        if (reason) {
          entry?.conn.send({ type: 'share-denied', reason })
          call.close()
          return
        }
        call.answer()
        call.on('stream', (remote) => {
          if (s.guest?.call === call || s.media || s.guest) return
          s.guest = { id, call, stream: remote }
          publish(true)
        })
        call.on('close', () => {
          if (s.guest?.call === call) stopGuest(false)
        })
      })

      peer.on('error', () => {})
    },
    [addChat, dropViewer, publish, removeViewer, sendTo, setModerator, setSharer, stopGuest, sync],
  )

  /** Explains a failed capture; a failure while asking for audio offers a retry without it. */
  const reportCaptureError = useCallback((err, audio) => {
    if (err.name === 'NotAllowedError') return
    console.warn('Espelhar: falha na captura', err)
    if (err.name === 'NotReadableError' && audio) {
      setAudioFailed(true)
      setError('O navegador não conseguiu capturar o áudio da aba. Tente de novo ou espelhe sem áudio.')
    } else {
      setError(`Não foi possível capturar a tela neste navegador. (${err.name})`)
    }
  }, [])

  const start = useCallback(
    async (password = '', hostName = '', { audio = true, share = true, quality: initialQuality = DEFAULT_QUALITY } = {}) => {
      setError('')
      setAudioFailed(false)
      setStatus('starting')

      // `share: false` opens an empty room; the screen can be shared later from inside it.
      let media = null
      if (share) {
        try {
          media = await captureScreen(initialQuality, audio)
        } catch (err) {
          setStatus('idle')
          reportCaptureError(err, audio)
          return
        }
      }

      try {
        const { peer, code } = await openHostPeer()
        const s = {
          peer,
          password,
          name: cleanName(hostName),
          place: knownPlace(),
          media: null,
          guest: null,
          entries: new Map(),
          mods: new Set(),
          sharers: new Set(),
          banned: new Set(),
          fails: new Map(),
          failLog: [],
          calls: new Map(),
          quality: initialQuality,
          chat: [],
          chatSeq: 0,
          sweep: null,
        }
        s.sweep = every(SWEEP_MS, () => {
          const now = Date.now()
          for (const [id, entry] of s.entries) if (now - entry.seen > SILENCE_MS) dropViewer(id)
        })
        session.current = s
        attach(peer)
        if (media) beginBroadcast(media)

        setPlace(s.place)
        getPlace().then((found) => {
          if (session.current !== s) return
          setPlaceError(found ? '' : placeFailure())
          if (!found) return
          s.place = found
          setPlace(found)
          sync()
        })

        setQualityState(initialQuality)
        setName(s.name)
        setCode(code)
        setLocked(Boolean(password))
        setStatus('live')
      } catch {
        media?.getTracks().forEach((track) => track.stop())
        session.current?.sweep?.()
        session.current?.peer.destroy()
        session.current = null
        setError('Não foi possível criar a sala. Verifique sua conexão e tente de novo.')
        setStatus('idle')
      }
    },
    [attach, beginBroadcast, dropViewer, reportCaptureError, sync],
  )

  /** Starts a new broadcast in a room that is already open. */
  const shareAgain = useCallback(
    async ({ audio = true } = {}) => {
    setError('')
    setAudioFailed(false)
    let media
    try {
      media = await captureScreen(session.current?.quality, audio)
    } catch (err) {
      reportCaptureError(err, audio)
      return
    }
    if (!session.current) {
      media.getTracks().forEach((track) => track.stop())
      return
    }
    beginBroadcast(media)
    },
    [beginBroadcast, reportCaptureError],
  )

  /** Moves the room to a new code (random when `desired` is empty). Viewers follow automatically. */
  const changeCode = useCallback(
    async (desired = '') => {
      const s = session.current
      if (!s) return { error: 'A sala não está ativa.' }
      const wanted = normalizeCode(desired)
      if (wanted && wanted.length !== CODE_LENGTH) return { error: `O código precisa ter ${CODE_LENGTH} caracteres.` }
      if (wanted && s.peer.id.endsWith(wanted)) return { error: 'Esse já é o código da sala.' }

      let next
      try {
        next = await openHostPeer(wanted)
      } catch (err) {
        return {
          error:
            err.type === 'unavailable-id'
              ? 'Esse código já está em uso. Escolha outro.'
              : 'Não foi possível trocar o código agora.',
        }
      }
      if (session.current !== s) {
        next.peer.destroy()
        return { error: 'A sala foi encerrada.' }
      }

      const old = s.peer
      s.peer = next.peer
      attach(next.peer)
      for (const entry of s.entries.values()) entry.conn.send({ type: 'recode', code: next.code })
      setCode(next.code)
      setTimeout(() => old.destroy(), OLD_PEER_GRACE_MS)
      return { code: next.code }
    },
    [attach],
  )

  /** Changes the quality preset live: capture size and frame rate plus every outgoing encoder. */
  const setQuality = useCallback((next) => {
    const s = session.current
    if (!s) return
    s.quality = next
    setQualityState(next)
    applyQuality(s.media, next)
    for (const call of s.calls.values()) tuneCall(call, next)
  }, [])

  actions.current.changeCode = changeCode

  useEffect(() => () => stop(), [stop])

  // Closing the tab must close the room right away, not leave viewers waiting on a timeout.
  useEffect(() => {
    const leaving = () => stop({ immediate: true })
    window.addEventListener('pagehide', leaving)
    return () => window.removeEventListener('pagehide', leaving)
  }, [stop])

  return {
    status,
    code,
    locked,
    participants,
    stream,
    source,
    error,
    audioFailed,
    name,
    place,
    placeError,
    quality,
    setQuality,
    start,
    stop: () => stop(),
    messages,
    sendChat,
    stopSharing,
    stopGuest: () => stopGuest(true),
    shareAgain,
    kick: removeViewer,
    setModerator,
    setSharer,
    changeCode,
  }
}

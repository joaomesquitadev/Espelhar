import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_QUALITY, captureScreen, raiseStartBitrate, tuneCall } from '../lib/media.js'
import { every } from '../lib/ticker.js'
import { cleanName, cleanPlace, cleanText, getPlace, hostId, knownPlace, openViewerPeer, safeCode } from '../lib/room.js'

const CONNECT_TIMEOUT_MS = 30000 // relayed (TURN) connections take longer to set up
const DIRECT_TIMEOUT_MS = 15000 // then the relay-only attempt takes over
const NOT_FOUND_RETRIES = 2 // a host that just lost its signalling link is back within a few seconds
const NOT_FOUND_DELAY_MS = 3500
const IN_ROOM = ['connecting', 'watching', 'waiting']
const NO_SHARE = { active: false, byId: '', byName: '', audio: false }
const CODE_REPLY_TIMEOUT_MS = 8000
const PING_MS = 5000
const SILENCE_MS = 45000 // the host answers every ping: this long without hearing anything means the link is dead
const MAX_RECOVERIES = 6 // automatic rejoin attempts after the link drops, before giving up
const RECOVERY_STEP_MS = 1500
const MAX_CHAT_LENGTH = 500
const MAX_CHAT_HISTORY = 100

/** Chat lines come from the host's browser, so rebuild every field instead of trusting the shape. */
function cleanChat(m) {
  return { id: Number(m?.id) || 0, fromId: String(m?.fromId ?? ''), from: cleanName(m?.from), text: cleanText(m?.text, MAX_CHAT_LENGTH), ts: Number(m?.ts) || 0 }
}

/** status: idle | connecting | password | watching | waiting | ended | kicked | error */
export function useViewer() {
  const [status, setStatus] = useState('idle')
  const [stream, setStream] = useState(null)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [roster, setRoster] = useState({ host: '', hostPlace: '', list: [] })
  const [meId, setMeId] = useState('')
  const [sharing, setSharing] = useState(NO_SHARE)
  const [localStream, setLocalStream] = useState(null)
  const [shareError, setShareError] = useState('')
  const [messages, setMessages] = useState([])
  const peerRef = useRef(null)
  const connRef = useRef(null)
  const callRef = useRef(null)
  const timerRef = useRef(null)
  const shareRef = useRef(null)
  const codeReply = useRef(null)
  const lastHeard = useRef(0)
  const creds = useRef({ name: '', password: '' })
  const heard = useRef(false) // the host has answered something on the current attempt
  const relayRef = useRef(false) // the current peer sends everything through the relay
  const roomRef = useRef('')
  const joinRef = useRef(null)
  const statusRef = useRef('idle')
  const notFound = useRef(0)
  const recoveries = useRef(0) // automatic rejoin attempts since the link last worked
  const retryTimer = useRef(null)
  statusRef.current = status

  /** Stops presenting my own screen; `notify` tells the host so it can stop relaying. */
  const stopShare = useCallback((notify = true) => {
    const current = shareRef.current
    if (!current) return
    shareRef.current = null
    current.media.getTracks().forEach((track) => track.stop())
    current.call.close()
    if (notify) connRef.current?.send({ type: 'share-stop' })
    setLocalStream(null)
  }, [])

  /** Leaves for good. The host is told first so the roster updates at once; `immediate` is for a closing tab. */
  const teardown = useCallback(
    (immediate = false) => {
      stopShare(false)
      clearTimeout(timerRef.current)
      clearTimeout(retryTimer.current)
      recoveries.current = 0
      const conn = connRef.current
      const peer = peerRef.current
      if (conn?.open) conn.send({ type: 'bye' })
      connRef.current = null
      callRef.current = null
      peerRef.current = null
      if (immediate) peer?.destroy()
      else setTimeout(() => peer?.destroy(), 300) // lets the goodbye leave before the connection drops
      setStream(null)
      setSharing(NO_SHARE)
      setMessages([])
    },
    [stopShare],
  )

  const leave = useCallback(() => {
    teardown()
    setError('')
    setShareError('')
    setCode('')
    setRoster({ host: '', hostPlace: '', list: [] })
    setStatus('idle')
  }, [teardown])

  const fail = useCallback((message) => {
    clearTimeout(timerRef.current)
    clearTimeout(retryTimer.current)
    recoveries.current = 0
    setError(message)
    setStatus('error')
  }, [])

  /**
   * The link to the host dropped without the host saying it closed the room (network blip, sleeping laptop,
   * a throttled tab). Rejoin on our own a few times; only a host that stays gone ends the room for us.
   */
  const lose = useCallback(() => {
    if (statusRef.current !== 'watching' && statusRef.current !== 'waiting') return
    if (recoveries.current >= MAX_RECOVERIES) {
      recoveries.current = 0
      setStatus('ended')
      return
    }
    const attempt = ++recoveries.current
    stopShare(false)
    clearTimeout(timerRef.current)
    clearTimeout(retryTimer.current)
    statusRef.current = 'connecting'
    setStatus('connecting')
    retryTimer.current = setTimeout(
      () => joinRef.current(roomRef.current, creds.current.name, creds.current.password),
      Math.min(RECOVERY_STEP_MS * attempt, 6000),
    )
  }, [stopShare])

  const connect = useCallback(
    (roomCode) => {
      const peer = peerRef.current
      setCode(roomCode)
      connRef.current?.close()
      const conn = peer.connect(hostId(roomCode), { reliable: true })
      connRef.current = conn
      roomRef.current = roomCode
      heard.current = false

      conn.on('open', () => {
        lastHeard.current = Date.now()
        const place = knownPlace()
        conn.send({ type: 'join', name: creds.current.name, password: creds.current.password, place })
        // The lookup may still be running: tell the host the city as soon as it is known.
        if (!place)
          getPlace().then((found) => {
            if (found && connRef.current === conn) conn.send({ type: 'place', place: found })
          })
      })
      conn.on('data', (msg) => {
        lastHeard.current = Date.now()
        heard.current = true
        switch (msg?.type) {
          case 'denied':
            clearTimeout(timerRef.current)
            if (msg.reason === 'name') {
              fail('Informe seu nome para entrar na sala.')
            } else if (msg.reason === 'full') {
              fail('A sala está cheia no momento.')
            } else if (msg.reason === 'rate') {
              fail('Muitas tentativas de senha nesta sala. Espere um minuto e tente de novo.')
            } else {
              setError(msg.reason === 'wrong' ? 'Senha incorreta. Tente de novo.' : '')
              setStatus('password')
            }
            break
          case 'roster':
            recoveries.current = 0
            // The host is trusted to run the room, not to send well-formed data: rebuild every field.
            setRoster({
              host: cleanName(msg.host),
              hostPlace: cleanPlace(msg.hostPlace),
              list: (Array.isArray(msg.list) ? msg.list : []).slice(0, 100).map((p) => ({
                id: String(p?.id ?? ''),
                name: cleanName(p?.name),
                place: cleanPlace(p?.place),
                mod: p?.mod === true,
                share: p?.share === true,
              })),
            })
            break
          case 'sharing':
            setSharing({
              active: msg.active === true,
              byId: String(msg.byId ?? ''),
              byName: cleanName(msg.byName),
              audio: msg.audio === true,
            })
            if (!msg.active) {
              clearTimeout(timerRef.current)
              setStream(null)
              setStatus((s) => (IN_ROOM.includes(s) ? 'waiting' : s))
            } else if (msg.byId === peerRef.current?.id) {
              clearTimeout(timerRef.current)
              setStatus('watching')
            }
            break
          case 'stop-share':
            stopShare(false)
            break
          case 'share-denied':
            stopShare(false)
            setShareError(
              msg.reason === 'busy'
                ? 'Alguém já está espelhando agora. Espere terminar.'
                : 'Você não tem permissão para espelhar nesta sala.',
            )
            break
          case 'chat': {
            const line = cleanChat(msg.msg)
            if (line.text) setMessages((all) => (all.some((m) => m.id === line.id) ? all : [...all, line].slice(-MAX_CHAT_HISTORY)))
            break
          }
          case 'chat-history':
            setMessages(
              (Array.isArray(msg.list) ? msg.list : [])
                .slice(-MAX_CHAT_HISTORY)
                .map(cleanChat)
                .filter((m) => m.text),
            )
            break
          case 'closed':
            // The host closed the room (or its tab): no need to wait for the connection to time out.
            if (connRef.current === conn) {
              connRef.current = null // on purpose: the close that follows is not a dropped link
              stopShare(false)
              clearTimeout(timerRef.current)
              setStatus((s) => (IN_ROOM.includes(s) ? 'ended' : s))
            }
            break
          case 'recode': {
            const next = safeCode(msg.code)
            if (!next) break
            stopShare(false)
            codeReply.current?.({ code: next })
            connect(next)
            break
          }
          case 'code-error':
            codeReply.current?.({ error: cleanText(msg.error, 120) })
            break
          case 'kicked':
            teardown(true)
            setStatus('kicked')
            break
        }
      })
      conn.on('close', () => {
        if (connRef.current === conn) lose()
      })

      // Before the host has answered anything, a failed attempt is retried once with every byte relayed
      // through the TURN server, which gets through VPNs and strict networks that block a direct path.
      const giveUp = (message) => {
        if (connRef.current !== conn || heard.current) return
        if (!relayRef.current) {
          relayRef.current = true
          clearTimeout(timerRef.current)
          const old = peerRef.current
          peerRef.current = null
          connRef.current = null
          old?.destroy()
          joinRef.current(roomCode, creds.current.name, creds.current.password, true)
          return
        }
        fail(message)
      }
      const TIMEOUT_MESSAGE =
        'A conexão demorou demais. Sua rede (ou a do anfitrião) bloqueia conexões diretas. Tente outro Wi-Fi ou dados móveis.'
      conn.on('error', () => giveUp(TIMEOUT_MESSAGE))
      conn.on('close', () => giveUp(TIMEOUT_MESSAGE))

      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => giveUp(TIMEOUT_MESSAGE), relayRef.current ? CONNECT_TIMEOUT_MS : DIRECT_TIMEOUT_MS)
    },
    [fail, lose, stopShare, teardown],
  )

  const join = useCallback(
    async (roomCode, name, password = '', relayOnly = false) => {
      creds.current = { name, password }
      if (!relayOnly) notFound.current = 0
      setError('')
      setStatus('connecting')

      let peer = peerRef.current
      if (!peer || peer.destroyed || peer.disconnected) {
        peer?.destroy()
        relayRef.current = relayOnly
        try {
          peer = await openViewerPeer(relayOnly)
        } catch {
          fail('Não foi possível conectar ao serviço de salas. Verifique sua internet e tente de novo.')
          return
        }
        peerRef.current = peer
        setMeId(peer.id)

        // Only the room's host may send video here. Peer ids of other viewers are visible in the roster,
        // so any call from someone else is dropped instead of being played.
        peer.on('connection', (stray) => stray.close())
        peer.on('call', (call) => {
          if (call.peer !== connRef.current?.peer) {
            call.close()
            return
          }
          call.answer(undefined, { sdpTransform: raiseStartBitrate })
          callRef.current = call
          call.on('stream', (remote) => {
            clearTimeout(timerRef.current)
            setStream(remote)
            setStatus('watching')
          })
        })

        peer.on('error', (err) => {
          if (peerRef.current !== peer) return
          if (err.type === 'peer-unavailable') {
            // The host may be re-registering after a network blip: look again before giving up.
            if (statusRef.current === 'connecting' && notFound.current < NOT_FOUND_RETRIES) {
              notFound.current++
              setTimeout(() => {
                if (peerRef.current === peer && statusRef.current === 'connecting') connect(roomRef.current)
              }, NOT_FOUND_DELAY_MS)
              return
            }
            if (recoveries.current > 0) {
              // We were inside this room a moment ago and it no longer exists: it simply ended.
              recoveries.current = 0
              clearTimeout(timerRef.current)
              setStatus('ended')
              return
            }
            fail('Não encontramos uma sala com esse código. Confira com quem está espelhando.')
            return
          }
          // Once inside, a signalling hiccup must not throw the person out: the room link is already direct.
          if (statusRef.current === 'connecting' || statusRef.current === 'idle') {
            fail('A conexão falhou. Verifique sua internet e tente de novo.')
          }
        })
      }

      connect(roomCode)
    },
    [connect, fail],
  )
  joinRef.current = join

  /** Presents my screen to the room. Only works if the host granted permission. */
  const startShare = useCallback(async () => {
    setShareError('')
    const peer = peerRef.current
    const conn = connRef.current
    if (!peer || !conn || shareRef.current) return

    let media
    try {
      media = await captureScreen(DEFAULT_QUALITY)
    } catch (err) {
      if (err.name !== 'NotAllowedError') setShareError(`Não foi possível capturar a tela neste navegador. (${err.name})`)
      return
    }

    const call = peer.call(conn.peer, media)
    tuneCall(call, DEFAULT_QUALITY)
    shareRef.current = { media, call }
    media.getVideoTracks()[0].addEventListener('ended', () => {
      if (shareRef.current?.media === media) stopShare(true)
    })
    setLocalStream(media)
  }, [stopShare])

  // Admin commands: the host checks the permission again before doing any of them.
  const kick = useCallback((target) => connRef.current?.send({ type: 'kick', target }), [])
  const setAdmin = useCallback((target, value) => connRef.current?.send({ type: 'set-admin', target, value }), [])
  const setSharer = useCallback((target, value) => connRef.current?.send({ type: 'set-sharer', target, value }), [])
  const stopGuest = useCallback(() => connRef.current?.send({ type: 'stop-guest' }), [])
  const changeCode = useCallback(
    (desired) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => finish({ error: 'O anfitrião não respondeu. Tente de novo.' }), CODE_REPLY_TIMEOUT_MS)
        function finish(result) {
          clearTimeout(timer)
          codeReply.current = null
          resolve(result)
        }
        codeReply.current = finish
        connRef.current?.send({ type: 'change-code', code: desired })
      }),
    [],
  )

  useEffect(() => leave, [leave])

  // Keeps the host's roster honest and notices a link that died. The ticker keeps running in a background tab,
  // and coming back to the tab (or the network returning) checks the link at once.
  useEffect(() => {
    const check = () => {
      const conn = connRef.current
      if (!conn) return
      if (conn.open) conn.send({ type: 'ping' })
      const live = statusRef.current === 'watching' || statusRef.current === 'waiting'
      if (live && (!conn.open || Date.now() - lastHeard.current > SILENCE_MS)) {
        connRef.current = null
        conn.close()
        lose()
      }
    }
    const stop = every(PING_MS, check)
    const wake = () => {
      if (document.visibilityState !== 'hidden') check()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
    }
  }, [lose])

  // Closing the tab must take me out of the room right away, not after a timeout.
  useEffect(() => {
    const leaving = () => teardown(true)
    window.addEventListener('pagehide', leaving)
    return () => window.removeEventListener('pagehide', leaving)
  }, [teardown])

  const sendChat = useCallback((text) => {
    const clean = cleanText(text, MAX_CHAT_LENGTH)
    if (clean) connRef.current?.send({ type: 'chat', text: clean })
  }, [])

  return {
    status,
    stream: localStream ?? stream,
    error,
    code,
    roster,
    meId,
    sharing,
    presenting: Boolean(localStream),
    shareError,
    messages,
    sendChat,
    join,
    leave,
    kick,
    setAdmin,
    setSharer,
    stopGuest,
    changeCode,
    startShare,
    stopShare,
  }
}

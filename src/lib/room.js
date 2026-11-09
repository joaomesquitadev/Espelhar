import Peer from 'peerjs'
import { every } from './ticker.js'

const PREFIX = 'espelhar-'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const NAME_KEY = 'espelhar:name'

export const CODE_LENGTH = 6
export const MIN_NAME = 2
export const MAX_NAME = 24

export function normalizeCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
}

// Control characters and invisible or bidirectional-override marks let a name impersonate someone else.
const UNSAFE_TEXT = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g

export function cleanText(value, max) {
  return String(value ?? '')
    .replace(UNSAFE_TEXT, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** Minimum pause between two chat messages from one person. The host enforces it; the chat box mirrors it. */
export const CHAT_COOLDOWN_MS = 1500

export function cleanName(value) {
  return cleanText(value, MAX_NAME)
}

/** A well-formed room code, or '' for anything else. Codes arrive over the network and are never trusted as-is. */
export function safeCode(value) {
  const code = String(value ?? '')
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : ''
}

/** Compares two secrets without stopping at the first different character. */
export function sameSecret(a, b) {
  const x = String(a)
  const y = String(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0)
  return diff === 0
}

// The key also lives in .env, but a dev server started before that file existed never reads it.
// Kept here as a fallback so the city lookup works either way (the owner accepted the key being public).
const GEO_KEY = import.meta.env.VITE_IPGEOLOCATION_KEY || 'a859846320a74ffd8e93c4d19e73a6d4'
const GEO_TIMEOUT_MS = 8000
let placePromise
let placeValue = ''
let placeProblem = ''

// The provider reports some districts instead of the city people call home.
const CITY_ALIASES = { 'Plano Piloto': 'Brasília' }

async function fetchPlace() {
  if (!GEO_KEY) {
    placeProblem = 'sem-chave'
    console.warn('Espelhar: defina VITE_IPGEOLOCATION_KEY no arquivo .env para mostrar a cidade.')
    return ''
  }
  try {
    const url = new URL('https://api.ipgeolocation.io/v2/ipgeo')
    url.search = new URLSearchParams({ apiKey: GEO_KEY })
    const res = await fetch(url, { signal: AbortSignal.timeout(GEO_TIMEOUT_MS) })
    if (!res.ok) {
      placeProblem = `http-${res.status}`
      console.warn('Espelhar: ipgeolocation.io respondeu', res.status)
      return ''
    }
    const data = await res.json()
    const city = cleanPlace(data.location?.city ?? data.city)
    placeProblem = city ? '' : 'sem-cidade'
    return CITY_ALIASES[city] ?? city
  } catch (err) {
    placeProblem = err.name === 'TimeoutError' ? 'lento' : 'bloqueado'
    console.warn('Espelhar: falha ao consultar a cidade (algum bloqueador pode estar impedindo o pedido)', err)
    return ''
  }
}

/** City from the visitor's IP via ipgeolocation.io. A failed lookup is not cached, so the next call tries again. */
export function getPlace() {
  placePromise ??= fetchPlace().then((found) => {
    if (found) placeValue = found
    else placePromise = undefined
    return found
  })
  return placePromise
}

/** The city if the lookup already finished, otherwise ''. Lets joins go out without waiting for the network. */
export const knownPlace = () => placeValue

/** Why the last city lookup came back empty, as a short code ('' when it worked or has not run). */
export const placeFailure = () => placeProblem

const PLACE_PROBLEMS = {
  'sem-chave': 'A chave da API não foi carregada. Reinicie o servidor (npm run dev) depois de editar o arquivo .env.',
  bloqueado: 'O navegador bloqueou a consulta da cidade. Libere o site no bloqueador de anúncios ou no Brave Shields.',
  lento: 'A consulta da cidade demorou demais. Tente de novo em instantes.',
  'sem-cidade': 'A API não devolveu uma cidade para o seu IP.',
}

export function placeProblemText(code) {
  if (!code) return ''
  if (code.startsWith('http-')) return `A API recusou a consulta da cidade (código ${code.slice(5)}). Confira a chave no arquivo .env.`
  return PLACE_PROBLEMS[code] ?? ''
}

export function cleanPlace(value) {
  return cleanText(value, 40)
}

export function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // storage unavailable: the name just is not remembered
  }
}

export function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

// Direct connections fail on strict networks and need a TURN relay. The free public ones this app used to list
// (peerjs.com, openrelay.metered.ca) no longer work, so set VITE_TURN_URLS (comma separated), VITE_TURN_USER
// and VITE_TURN_PASS to use your own relay.
const ownTurn = import.meta.env.VITE_TURN_URLS
const ICE_SERVERS = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:global.stun.twilio.com:3478',
      'stun:stun.cloudflare.com:3478',
    ],
  },
  ...(ownTurn
    ? [{ urls: ownTurn.split(',').map((u) => u.trim()), username: import.meta.env.VITE_TURN_USER, credential: import.meta.env.VITE_TURN_PASS }]
    : []),
]
const PEER_OPTIONS = { config: { iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 } }
// `relay` sends every byte through the TURN server: slower, but it works when a direct path (VPN, strict NAT) does not.
const RELAY_OPTIONS = { config: { iceServers: ICE_SERVERS, iceTransportPolicy: 'relay' } }

/**
 * Keeps a peer registered with the signalling server. The server forgets a peer that misses its heartbeats
 * (a sleeping laptop, a throttled background tab, a Wi-Fi blip), and from then on nobody can join that room
 * even though the host still sees it open. Reconnecting under the same id puts the room back.
 */
function keepSignalling(peer) {
  const check = () => {
    if (peer.destroyed || !peer.disconnected) return
    try {
      peer.reconnect()
    } catch {
      // tried again on the next tick
    }
  }
  const stopTimer = every(3000, check)
  const stop = () => {
    stopTimer()
    window.removeEventListener('online', check)
    document.removeEventListener('visibilitychange', check)
  }
  window.addEventListener('online', check)
  document.addEventListener('visibilitychange', check)
  peer.on('disconnected', check)
  peer.on('close', stop)
}

/** Opens a peer under a room code. Random codes retry when taken; a chosen code rejects with `unavailable-id`. */
export function openHostPeer(desired, attempts = 5) {
  return new Promise((resolve, reject) => {
    const code = desired || randomCode()
    const peer = new Peer(PREFIX + code, PEER_OPTIONS)
    peer.once('open', () => {
      keepSignalling(peer)
      resolve({ peer, code })
    })
    peer.once('error', (err) => {
      peer.destroy()
      if (!desired && err.type === 'unavailable-id' && attempts > 1) {
        openHostPeer(undefined, attempts - 1).then(resolve, reject)
      } else {
        reject(err)
      }
    })
  })
}

export function openViewerPeer(relayOnly = false) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(relayOnly ? RELAY_OPTIONS : PEER_OPTIONS)
    peer.once('open', () => {
      keepSignalling(peer)
      resolve(peer)
    })
    peer.once('error', (err) => {
      peer.destroy()
      reject(err)
    })
  })
}

export const hostId = (code) => PREFIX + code

export function roomLink(code) {
  return `${location.origin}${location.pathname}?sala=${code}`
}

export function codeFromUrl() {
  return normalizeCode(new URLSearchParams(location.search).get('sala') ?? '')
}

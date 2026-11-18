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

const STUN_URLS = [
  'stun:stun.cloudflare.com:3478',
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:global.stun.twilio.com:3478',
]

const PEER_OPTIONS = { config: { iceServers: [{ urls: STUN_URLS }], iceCandidatePoolSize: 4 } }

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

const SIGNALLING_TIMEOUT_MS = 12000
const SIGNALLING_ATTEMPTS = 3
// Errors that say "the signalling server could not be reached", as opposed to "that id is taken" or "bad request".
const RETRYABLE = new Set(['timeout', 'network', 'server-error', 'socket-error', 'socket-closed'])

/**
 * Registers a new Peer with the signalling server. Behind a VPN (Cloudflare WARP / 1.1.1.1 and others) the first
 * WebSocket often stalls or drops, and PeerJS then waits forever without an error, so each attempt has a deadline
 * and a few fresh attempts are made before giving up.
 */
function registerPeer(id, options, attempts = SIGNALLING_ATTEMPTS) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, options) : new Peer(options)
    const fail = (err) => {
      clearTimeout(timer)
      peer.destroy()
      if (attempts > 1 && RETRYABLE.has(err.type)) registerPeer(id, options, attempts - 1).then(resolve, reject)
      else reject(err)
    }
    const timer = setTimeout(() => fail({ type: 'timeout' }), SIGNALLING_TIMEOUT_MS)
    peer.once('open', () => {
      clearTimeout(timer)
      peer.off('error', fail)
      keepSignalling(peer)
      resolve(peer)
    })
    peer.once('error', fail)
  })
}

/** Opens a peer under a room code. Random codes retry when taken; a chosen code rejects with `unavailable-id`. */
export async function openHostPeer(desired, attempts = 5) {
  const code = desired || randomCode()
  try {
    return { peer: await registerPeer(PREFIX + code, PEER_OPTIONS), code }
  } catch (err) {
    if (!desired && err.type === 'unavailable-id' && attempts > 1) return openHostPeer(undefined, attempts - 1)
    throw err
  }
}

export function openViewerPeer() {
  return registerPeer(undefined, PEER_OPTIONS)
}

export const hostId = (code) => PREFIX + code

export function roomLink(code) {
  return `${location.origin}${location.pathname}?sala=${code}`
}

export function codeFromUrl() {
  return normalizeCode(new URLSearchParams(location.search).get('sala') ?? '')
}

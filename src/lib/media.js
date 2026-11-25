/**
 * Quality presets: both send 1080p. The capture itself asks for the screen's full size and the
 * encoder scales down to `height`. Real quality is still capped by the sender's upload speed,
 * split across every viewer.
 */
export const QUALITIES = {
  '1080p30': { label: '1080p · 30 fps', detail: 'Mais estável, usa menos internet', height: 1080, fps: 30, bitrate: 4_000_000, hint: 'detail' },
  '1080p60': { label: '1080p · 60 fps', detail: 'Mais fluido, usa mais internet de envio', height: 1080, fps: 60, bitrate: 8_000_000, hint: '' },
}

export const DEFAULT_QUALITY = '1080p30'

/** Phones and tablets, iPadOS included (it reports itself as a Mac with a touch screen). */
export const IS_MOBILE =
  typeof navigator !== 'undefined' &&
  (navigator.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/** Whether this device can share its screen: mobile browsers cannot, even when they expose the API. */
export const CAN_SHARE = !IS_MOBILE && Boolean(navigator.mediaDevices?.getDisplayMedia)

/**
 * Where the broadcast's sound comes from:
 * - 'screen': the tab, system or window audio the share picker offers (mixes every app on the system);
 * - 'none': no sound;
 * - 'device:<deviceId>': one audio input, such as a virtual cable (VB-Cable "CABLE Output") that only
 *   the chosen apps play into, which is how a game is sent without the Discord call.
 */
export const AUDIO_SCREEN = 'screen'
export const AUDIO_NONE = 'none'
const DEVICE_PREFIX = 'device:'
const AUDIO_SOURCE_KEY = 'espelhar.audioSource'

export function deviceSource(deviceId) {
  return DEVICE_PREFIX + deviceId
}

/** The input device id of a 'device:' source, or '' for the others. */
export function sourceDevice(source) {
  return typeof source === 'string' && source.startsWith(DEVICE_PREFIX) ? source.slice(DEVICE_PREFIX.length) : ''
}

/** Accepts the old boolean `audio` flag as well as a source string. */
function normalizeSource(source) {
  if (source === true || source == null) return AUDIO_SCREEN
  if (source === false) return AUDIO_NONE
  return source === AUDIO_NONE || sourceDevice(source) ? source : AUDIO_SCREEN
}

export function loadAudioSource() {
  try {
    return normalizeSource(localStorage.getItem(AUDIO_SOURCE_KEY))
  } catch {
    return AUDIO_SCREEN
  }
}

export function saveAudioSource(source) {
  try {
    localStorage.setItem(AUDIO_SOURCE_KEY, normalizeSource(source))
  } catch {
    // storage unavailable: the choice just is not remembered
  }
}

/**
 * Audio inputs the browser can open. Until the page has been allowed to use a microphone once (see
 * `unlockAudioLabels`) browsers hide the inputs' ids and names, and `locked` is true. The "default" and
 * "communications" aliases are left out because they only repeat a real device under another name.
 */
export async function listAudioInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return { devices: [], locked: false }
  const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput')
  const devices = inputs
    .filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Entrada de áudio ${i + 1}` }))
  return { devices, locked: inputs.some((d) => !d.deviceId || !d.label) }
}

/** Asks for microphone permission once, only so device names show up, and releases it right away. */
export async function unlockAudioLabels() {
  const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
  probe.getTracks().forEach((track) => track.stop())
}

/** Opens one audio input untouched: no echo cancellation, noise suppression or gain control squashing a game. */
export async function captureAudioDevice(deviceId) {
  const media = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
    },
  })
  return media.getAudioTracks()[0]
}

/**
 * Captures the screen plus the sound of `audioSource` (see AUDIO_SCREEN). One prompt for the screen;
 * a 'device:' source then opens that input separately and adds its track to the same stream.
 */
export async function captureScreen(quality = DEFAULT_QUALITY, audioSource = AUDIO_SCREEN) {
  const source = normalizeSource(audioSource)
  const deviceId = sourceDevice(source)
  const media = await captureDisplay(quality, source === AUDIO_SCREEN)
  if (deviceId) {
    try {
      media.addTrack(await captureAudioDevice(deviceId))
    } catch (err) {
      media.getTracks().forEach((track) => track.stop())
      err.audioDevice = true
      throw err
    }
  }
  return media
}

/**
 * Captures the screen with audio from a tab, the whole system or a window, depending on what the browser offers. One prompt, no retries.
 * The request stays minimal because browsers differ in which constraints they accept at capture time;
 * the frame rate is applied to the live track afterwards.
 */
async function captureDisplay(quality, audio) {
  const q = QUALITIES[quality] ?? QUALITIES[DEFAULT_QUALITY]
  // systemAudio "include" offers the "share system audio" option when a whole screen is picked, and
  // windowAudio "window" asks for the shared window's own sound where the browser supports it; browsers
  // that do not know a constraint ignore it. Voice processing is turned off so music and apps are not
  // squashed by echo cancellation or noise suppression.
  // The size and frame rate ceilings matter on multi-monitor setups: without them the browser grabs the
  // monitor at native size (often 4K or two screens wide) and the encoder chokes on it.
  // selfBrowserSurface "exclude" removes this very tab from the picker, avoiding the hall-of-mirrors loop.
  const base = audio
    ? {
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: 'include',
        windowAudio: 'window',
        selfBrowserSurface: 'exclude',
      }
    : { audio: false, selfBrowserSurface: 'exclude' }
  let media
  try {
    media = await navigator.mediaDevices.getDisplayMedia({
      ...base,
      video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { ideal: q.fps, max: q.fps } },
    })
  } catch (err) {
    // A browser that rejects these constraints fails before showing any prompt, so asking again is safe.
    if (err.name !== 'OverconstrainedError' && err.name !== 'TypeError') throw err
    media = await navigator.mediaDevices.getDisplayMedia({ ...base, video: true })
  }
  applyQuality(media, quality)
  return media
}

/** What is being captured: 'monitor' (a whole screen), 'window', 'browser' (a tab), or '' when the browser does not say. */
export function captureSurface(media) {
  return media?.getVideoTracks()[0]?.getSettings().displaySurface ?? ''
}

/** Re-applies a preset's frame rate and content hint to a live capture. */
export function applyQuality(media, quality) {
  const q = QUALITIES[quality] ?? QUALITIES[DEFAULT_QUALITY]
  const track = media?.getVideoTracks()[0]
  if (!track) return
  track.contentHint = q.hint
  track.applyConstraints({ frameRate: { ideal: q.fps } }).catch(() => {})
}

/** Sets bitrate, frame rate and picture size ceilings on an outgoing call once it is connected. */
export function tuneCall(call, quality) {
  const q = QUALITIES[quality] ?? QUALITIES[DEFAULT_QUALITY]
  const pc = call?.peerConnection
  if (!pc) return
  const apply = () => {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue
      try {
        const nativeHeight = sender.track.getSettings().height ?? 0
        const params = sender.getParameters()
        if (!params.encodings?.length) params.encodings = [{}]
        const encoding = params.encodings[0]
        encoding.maxBitrate = q.bitrate
        encoding.maxFramerate = q.fps
        encoding.scaleResolutionDownBy = q.height && nativeHeight > q.height ? nativeHeight / q.height : 1
        sender.setParameters(params).catch(() => {})
      } catch {
        // the browser refused these parameters: it keeps its own defaults
      }
    }
  }
  if (pc.connectionState === 'connected') apply()
  else
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'connected') apply()
    })
}

const VIDEO_CODECS = /^(VP8|VP9|H264|AV1)$/i
const BITRATE_HINTS = 'x-google-min-bitrate=1500;x-google-start-bitrate=3000;x-google-max-bitrate=30000'

/**
 * Viewer-side SDP tweak: asks the sender to start at a healthy bitrate and not sink below a floor,
 * so the picture does not melt whenever the bandwidth estimate dips. Only the main video codecs are
 * touched (never the retransmission "rtx" entries), and a missing fmtp line is added where needed.
 */
export function raiseStartBitrate(sdp) {
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n'
  const lines = sdp.split(eol)

  const primary = new Set()
  const hasFmtp = new Set()
  let video = false
  for (const line of lines) {
    if (line.startsWith('m=')) video = line.startsWith('m=video')
    if (!video) continue
    const rtpmap = line.match(/^a=rtpmap:(\d+) ([^/]+)\//)
    if (rtpmap && VIDEO_CODECS.test(rtpmap[2])) primary.add(rtpmap[1])
    const fmtp = line.match(/^a=fmtp:(\d+) /)
    if (fmtp) hasFmtp.add(fmtp[1])
  }

  const out = []
  video = false
  for (const line of lines) {
    if (line.startsWith('m=')) video = line.startsWith('m=video')
    const fmtp = video && line.match(/^a=fmtp:(\d+) /)
    if (fmtp && primary.has(fmtp[1])) {
      out.push(line + ';' + BITRATE_HINTS)
      continue
    }
    out.push(line)
    const rtpmap = video && line.match(/^a=rtpmap:(\d+) /)
    if (rtpmap && primary.has(rtpmap[1]) && !hasFmtp.has(rtpmap[1])) out.push('a=fmtp:' + rtpmap[1] + ' ' + BITRATE_HINTS)
  }
  return out.join(eol)
}

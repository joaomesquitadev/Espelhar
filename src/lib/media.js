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
 * Captures the screen with audio from a tab, the whole system or a window, depending on what the browser offers. One prompt, no retries.
 * The request stays minimal because browsers differ in which constraints they accept at capture time;
 * the frame rate is applied to the live track afterwards.
 */
export async function captureScreen(quality = DEFAULT_QUALITY, audio = true) {
  const q = QUALITIES[quality] ?? QUALITIES[DEFAULT_QUALITY]
  // systemAudio "include" offers the "share system audio" option when a whole screen is picked, and
  // windowAudio "window" asks for the shared window's own sound where the browser supports it; browsers
  // that do not know a constraint ignore it. Voice processing is turned off so music and apps are not
  // squashed by echo cancellation or noise suppression.
  // The size and frame rate ceilings matter on multi-monitor setups: without them the browser grabs the
  // monitor at native size (often 4K or two screens wide) and the encoder chokes on it.
  // selfBrowserSurface "exclude" removes this very tab from the picker, avoiding the hall-of-mirrors loop.
  const base = {
    audio: audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
    systemAudio: 'include',
    windowAudio: 'window',
    selfBrowserSurface: 'exclude',
  }
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

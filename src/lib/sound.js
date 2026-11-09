let ctx

/** Call from a click handler so the browser lets the chime play later. */
export function primeAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
  } catch {
    // audio unavailable: the room just stays silent
  }
}

/** Two quick, high "tic-tic" taps for a new chat message: triangle wave and a repeated note, unlike the join chime's rising sine pair. */
export function playChatSound() {
  if (!ctx) return
  const start = ctx.currentTime + 0.02
  ;[0, 0.09].forEach((offset) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 1318.5
    gain.gain.setValueAtTime(0.0001, start + offset)
    gain.gain.exponentialRampToValueAtTime(0.2, start + offset + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.07)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start + offset)
    osc.stop(start + offset + 0.09)
  })
}

/** Short two-note chime for someone entering the room. */
export function playJoinSound() {
  if (!ctx) return
  const start = ctx.currentTime + 0.02
  ;[
    [659.25, 0],
    [987.77, 0.11],
  ].forEach(([freq, offset]) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, start + offset)
    gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.45)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start + offset)
    osc.stop(start + offset + 0.5)
  })
}

/**
 * An interval that keeps its rhythm in a background tab. Browsers slow page timers down to about once a minute
 * for hidden tabs, which made heartbeats miss their window and rooms drop "by themselves" after a while.
 * A worker's clock is not throttled, so it drives every callback; without worker support it falls back to setInterval.
 */
const subscribers = new Set()
let worker
let fallback

function tick() {
  const now = Date.now()
  for (const sub of subscribers) {
    if (now - sub.last >= sub.ms - 50) {
      sub.last = now
      try {
        sub.fn()
      } catch (err) {
        console.warn('Espelhar: erro em tarefa periódica', err)
      }
    }
  }
}

function startClock() {
  if (worker || fallback) return
  try {
    worker = new Worker(new URL('./ticker.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = tick
    worker.onerror = () => {
      worker?.terminate()
      worker = undefined
      if (subscribers.size) fallback = setInterval(tick, 1000)
    }
  } catch {
    fallback = setInterval(tick, 1000)
  }
}

function stopClock() {
  worker?.terminate()
  worker = undefined
  clearInterval(fallback)
  fallback = undefined
}

/** Calls `fn` about every `ms` milliseconds (at one-second resolution). Returns a function that stops it. */
export function every(ms, fn) {
  const sub = { ms, fn, last: Date.now() }
  subscribers.add(sub)
  startClock()
  return () => {
    subscribers.delete(sub)
    if (!subscribers.size) stopClock()
  }
}

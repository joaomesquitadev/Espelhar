import { useEffect } from 'react'

const RIPPLE_TARGETS = '.btn:not(:disabled), .tabs button, .icon-btn'

/** Global scroll and click effects: header state and button ripples. Scrolling touches the DOM only when the header state flips. */
export function useInteractions() {
  useEffect(() => {
    const root = document.documentElement
    let frame = 0
    let scrolled = false

    function onScroll() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = window.scrollY > 8
        if (next === scrolled) return
        scrolled = next
        root.toggleAttribute('data-scrolled', next)
      })
    }

    function onClick(event) {
      const target = event.target.closest?.(RIPPLE_TARGETS)
      if (!target) return
      const rect = target.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height) * 2
      const ripple = document.createElement('span')
      ripple.className = 'ripple'
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left - size / 2}px;top:${event.clientY - rect.top - size / 2}px`
      target.append(ripple)
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true })
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('click', onClick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onClick)
    }
  }, [])
}

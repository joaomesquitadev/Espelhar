import { useEffect, useRef } from 'react'
import { playJoinSound } from '../lib/sound.js'

/**
 * Plays a chime when someone else joins. The first list that shows up (the host's own room, or, for a viewer,
 * the first list that already contains `selfId`) is only a baseline, so whoever just arrived never hears
 * the people who were already there, nor themselves.
 */
export function useJoinSound(list, { selfId = null } = {}) {
  const known = useRef(null)
  const owner = useRef(selfId)

  useEffect(() => {
    if (owner.current !== selfId) {
      owner.current = selfId
      known.current = null // a new identity (reconnected under another id) starts from a fresh baseline
    }
    if (selfId && !list.some((p) => p.id === selfId)) return // not in the room yet: nothing to compare against
    const ids = new Set(list.map((p) => p.id))
    ids.delete(selfId)
    const previous = known.current
    known.current = ids
    if (previous && [...ids].some((id) => !previous.has(id))) playJoinSound()
  }, [list, selfId])
}

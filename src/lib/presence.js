const LOCK_NAME = 'espelhar:room'

let release = null

/**
 * Claims the single "in a room" slot shared by every tab of this browser. Resolves true when this tab
 * holds it (already or newly) and false when another tab does. The lock is dropped by `releaseRoom`
 * or automatically when the tab closes or crashes. Browsers without Web Locks never block.
 */
export function claimRoom() {
  if (release) return Promise.resolve(true)
  if (!navigator.locks) return Promise.resolve(true)
  return new Promise((resolve) => {
    navigator.locks
      .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false)
          return
        }
        return new Promise((done) => {
          release = () => {
            release = null
            done()
          }
          resolve(true)
        })
      })
      .catch(() => resolve(true))
  })
}

export function releaseRoom() {
  release?.()
}

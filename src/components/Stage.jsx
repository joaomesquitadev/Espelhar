import { forwardRef, useEffect, useRef, useState } from 'react'

/**
 * Video surface for a MediaStream; shows `placeholder` until a stream arrives.
 * `muted` stays true for previews of your own screen; if the browser blocks sound, `onBlocked` fires.
 * `controls` is rendered inside the stage so it survives fullscreen.
 */
const Stage = forwardRef(function Stage({ stream, placeholder, muted = true, volume = 1, onBlocked, controls }, ref) {
  const video = useRef(null)
  const blocked = useRef(onBlocked)
  blocked.current = onBlocked
  const [size, setSize] = useState('')

  useEffect(() => {
    const el = video.current
    if (!el) return
    if (el.srcObject !== stream) el.srcObject = stream
    el.muted = muted
    el.volume = volume
    el.play?.().catch(() => {
      if (!el.muted) blocked.current?.()
    })
  }, [stream, muted, volume])

  useEffect(() => {
    const el = video.current
    if (!el) return
    const read = () => setSize(el.videoWidth ? `${el.videoWidth}×${el.videoHeight}` : '')
    el.addEventListener('loadedmetadata', read)
    el.addEventListener('resize', read)
    read()
    return () => {
      el.removeEventListener('loadedmetadata', read)
      el.removeEventListener('resize', read)
    }
  }, [stream])

  return (
    <div className="stage" ref={ref}>
      {stream ? (
        <>
          <video ref={video} autoPlay playsInline muted={muted} />
          {size && <span className="stage-size">{size}</span>}
          {controls && <div className="stage-controls">{controls}</div>}
        </>
      ) : (
        <div className="stage-empty">{placeholder}</div>
      )}
    </div>
  )
})

export default Stage

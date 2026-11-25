import { useCallback, useEffect, useState } from 'react'
import { AUDIO_NONE, AUDIO_SCREEN, deviceSource, listAudioInputs, sourceDevice, unlockAudioLabels } from '../lib/media.js'

/**
 * Chooses where the broadcast's sound comes from. The browser can only capture the whole system's
 * sound (game and Discord together), so sending one app alone goes through an audio input such as a
 * virtual cable that only that app plays into.
 */
export default function AudioSource({ value, onChange, sharing, stream, onShareAgain }) {
  const [devices, setDevices] = useState([])
  const [locked, setLocked] = useState(false)
  const [unlockError, setUnlockError] = useState('')
  const [screenPending, setScreenPending] = useState(false)

  const refresh = useCallback(() => {
    listAudioInputs()
      .then((found) => {
        setDevices(found.devices)
        setLocked(found.locked)
      })
      .catch(() => setDevices([]))
  }, [])

  useEffect(() => {
    refresh()
    const media = navigator.mediaDevices
    media?.addEventListener?.('devicechange', refresh)
    return () => media?.removeEventListener?.('devicechange', refresh)
  }, [refresh])

  // A new broadcast already uses the screen audio picked in the share prompt. Opening an input also
  // grants the microphone permission, which reveals the inputs' names, so the list is read again.
  useEffect(() => {
    setScreenPending(false)
    refresh()
  }, [stream, refresh])

  const unlock = async () => {
    setUnlockError('')
    try {
      await unlockAudioLabels()
      refresh()
    } catch {
      setUnlockError('Sem permissão de microfone, o navegador não mostra os nomes das entradas.')
    }
  }

  const pick = (next) => {
    setScreenPending(sharing && next === AUDIO_SCREEN && next !== value)
    onChange(next)
  }

  const deviceId = sourceDevice(value)
  const missing = deviceId && !devices.some((d) => d.id === deviceId)

  return (
    <div className="quality audio-source">
      <label className="field-label" htmlFor="audio-source">
        Fonte de áudio
      </label>
      <select id="audio-source" className="input" value={value} onChange={(e) => pick(e.target.value)}>
        <option value={AUDIO_SCREEN}>Áudio da tela ou do sistema (todos os apps)</option>
        <option value={AUDIO_NONE}>Sem áudio</option>
        {devices.length > 0 && (
          <optgroup label="Entrada de áudio específica">
            {devices.map((d) => (
              <option key={d.id} value={deviceSource(d.id)}>
                {d.label}
              </option>
            ))}
          </optgroup>
        )}
        {missing && <option value={value}>{locked ? 'Entrada escolhida' : 'Entrada escolhida (não encontrada)'}</option>}
      </select>
      {locked && (
        <button className="btn btn-ghost audio-unlock" type="button" onClick={unlock}>
          Mostrar os nomes das entradas
        </button>
      )}
      {unlockError && <span className="field-hint">{unlockError}</span>}
      {screenPending ? (
        <div className="message-actions">
          <span className="field-hint">
            O áudio da tela só pode ser escolhido na janela de compartilhamento. Espelhe de novo para usá-lo.
          </span>
          <button className="btn btn-dark" type="button" onClick={() => onShareAgain()}>
            Espelhar de novo
          </button>
        </div>
      ) : (
        <span className="field-hint">
          {value === AUDIO_SCREEN &&
            'Leva todo o som do computador, inclusive chamadas do Discord. Para transmitir só um jogo, use um cabo de áudio virtual e escolha a entrada dele aqui.'}
          {value === AUDIO_NONE && 'Quem assiste vê a tela sem som.'}
          {deviceId &&
            'Só o que tocar nesta entrada vai para a transmissão. Com o VB-Cable, mande o jogo para "CABLE Input" em Configurações do Windows › Sistema › Som › Mixer de volume e escolha "CABLE Output" aqui.'}
        </span>
      )}
    </div>
  )
}

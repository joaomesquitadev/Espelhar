import { useState } from 'react'
import Icon from './Icon.jsx'
import { CODE_LENGTH, normalizeCode } from '../lib/room.js'

/** Inline form to move the room to another code. `onChangeCode(desired)` resolves to `{ error }` or `{ code }`. */
export default function ChangeCode({ code, onChangeCode }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function apply(desired) {
    setBusy(true)
    setError('')
    const result = await onChangeCode(desired)
    setBusy(false)
    if (result.error) setError(result.error)
    else {
      setOpen(false)
      setValue('')
    }
  }

  if (!open) {
    return (
      <button className="btn btn-dark btn-block" type="button" onClick={() => setOpen(true)}>
        <Icon name="edit" /> Trocar código
      </button>
    )
  }

  return (
    <form
      className="change-code"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.length === CODE_LENGTH) apply(value)
      }}
    >
      <label className="field field-dark">
        <span className="field-label">Novo código</span>
        <input
          className="input input-code"
          value={value}
          onChange={(e) => setValue(normalizeCode(e.target.value))}
          placeholder={code}
          maxLength={CODE_LENGTH}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby="change-code-hint"
        />
        <span className="field-hint" id="change-code-hint">
          {error || 'Quem está na sala reconecta sozinho. O link antigo deixa de funcionar.'}
        </span>
      </label>
      <div className="message-actions">
        <button className="btn btn-primary" type="submit" disabled={busy || value.length !== CODE_LENGTH}>
          Aplicar
        </button>
        <button className="btn btn-dark" type="button" disabled={busy} onClick={() => apply('')}>
          <Icon name="refresh" /> Aleatório
        </button>
        <button className="btn btn-dark" type="button" disabled={busy} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

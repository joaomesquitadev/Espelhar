import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import Reveal from './Reveal.jsx'
import DesktopOnly from './DesktopOnly.jsx'
import { CAN_SHARE, IS_MOBILE } from '../lib/media.js'
import { CODE_LENGTH, MAX_NAME, MIN_NAME, cleanName, normalizeCode } from '../lib/room.js'

const MIN_PASSWORD = 6

const STEPS = [
  ['Escolha a janela', 'Selecione a janela do app que quer mostrar.'],
  ['Envie o código', 'Mande o código ou o link a quem vai assistir.'],
  ['Pronto', 'A pessoa vê a sua tela ao vivo, direto do seu navegador.'],
]

export default function Home({ initialCode, initialName, starting, error, audioFailed, onStart, onJoin }) {
  const [tab, setTab] = useState(initialCode ? 'watch' : 'share')
  const [name, setName] = useState(initialName)
  const [code, setCode] = useState(initialCode)
  const [protect, setProtect] = useState(false)
  const [password, setPassword] = useState('')
  // A shared link opens a short invite card (name only) instead of the full form.
  const [invited, setInvited] = useState(initialCode.length === CODE_LENGTH)
  const nameRef = useRef(null)
  const joinRef = useRef(null)

  useEffect(() => {
    if (!invited) return
    // Returning visitors already have a name: focus the button so Enter joins at once.
    ;(initialName ? joinRef : nameRef).current?.focus()
  }, [invited, initialName])

  const nameOk = cleanName(name).length >= MIN_NAME
  const sharing = tab === 'share'
  const passwordInvalid = sharing && protect && password.length < MIN_PASSWORD
  const codeReady = code.length === CODE_LENGTH
  const cannotCreate = !nameOk || starting || passwordInvalid
  const blocked = sharing ? cannotCreate : !nameOk || !codeReady

  function submit(event) {
    event.preventDefault()
    if (blocked) return
    if (sharing) onStart(protect ? password : '', cleanName(name), CAN_SHARE ? undefined : { share: false })
    else onJoin(code, cleanName(name))
  }

  return (
    <main className="home">
      <section className="hero">
        <div className="hero-copy">
          <h1>Mostre sua tela com um código.</h1>
          <p className="lead">
            Quando o app não tem espelhamento de tela, mostre a sua pelo navegador. Sem conta e sem instalar nada: o
            vídeo vai direto de você para quem assiste.
          </p>
        </div>

        {IS_MOBILE ? (
          <DesktopOnly code={initialCode} />
        ) : (
        invited ? (
        <form className="panel" onSubmit={submit} aria-label="Entrar na sala">
          <div className="invite-head">
            <span className="field-label">Você foi convidado para a sala</span>
            <span className="invite-code mono">{code}</span>
          </div>

          <label className="field">
            <span className="field-label">Seu nome</span>
            <input
              ref={nameRef}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME}
              autoComplete="nickname"
              required
              aria-describedby="invite-name-hint"
            />
            <span className="field-hint" id="invite-name-hint">
              Os outros na sala veem esse nome.
            </span>
          </label>

          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}

          <button ref={joinRef} className="btn btn-primary btn-block" type="submit" disabled={blocked}>
            Entrar na sala
            <Icon name="arrow" />
          </button>
          <button className="link-btn" type="button" onClick={() => setInvited(false)}>
            Não é essa sala? Usar outro código
          </button>
        </form>
        ) : (
        <form className="panel" onSubmit={submit} aria-label="Começar">
          <div className="tabs" role="group" aria-label="O que você quer fazer?">
            <button type="button" aria-pressed={sharing} onClick={() => setTab('share')}>
              Espelhar
            </button>
            <button type="button" aria-pressed={!sharing} onClick={() => setTab('watch')}>
              Assistir
            </button>
          </div>

          <label className="field">
            <span className="field-label">Seu nome</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME}
              autoComplete="nickname"
              required
              aria-describedby="name-hint"
            />
            <span className="field-hint" id="name-hint">
              Obrigatório. Os outros na sala veem esse nome.
            </span>
          </label>

          {sharing ? (
            <>
              <div className="switch-row">
                <span id="protect-label">
                  <span className="switch-title">Proteger com senha</span>
                  <span className="field-hint">Só entra quem tiver a senha.</span>
                </span>
                <button
                  className="switch"
                  type="button"
                  role="switch"
                  aria-checked={protect}
                  aria-labelledby="protect-label"
                  onClick={() => setProtect(!protect)}
                />
              </div>

              {protect && (
                <label className="field">
                  <span className="field-label">Senha da sala</span>
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    aria-describedby="password-hint"
                  />
                  <span className="field-hint" id="password-hint">
                    Mínimo de {MIN_PASSWORD} caracteres.
                  </span>
                </label>
              )}

              {!CAN_SHARE && (
                <p className="notice">
                  Este dispositivo não permite espelhar a tela. Você pode criar a sala e assistir, e quem estiver num
                  computador espelha.
                </p>
              )}
              {audioFailed && CAN_SHARE && (
                <button
                  className="btn btn-dark btn-block"
                  type="button"
                  disabled={blocked}
                  onClick={() => onStart(protect ? password : '', cleanName(name), { audio: false })}
                >
                  Espelhar sem áudio
                </button>
              )}

            </>
          ) : (
            <label className="field">
              <span className="field-label">Código da sala</span>
              <input
                className="input input-code"
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                placeholder="ABC123"
                maxLength={CODE_LENGTH}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-describedby="code-hint"
              />
              <span className="field-hint" id="code-hint">
                Os {CODE_LENGTH} caracteres que aparecem para quem está espelhando.
              </span>
            </label>
          )}

          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn-primary btn-block" type="submit" disabled={blocked}>
            {sharing
              ? CAN_SHARE
                ? starting
                  ? 'Aguardando permissão…'
                  : 'Espelhar minha tela'
                : 'Criar sala'
              : 'Entrar na sala'}
            {!starting && <Icon name="arrow" />}
          </button>
          {sharing && CAN_SHARE && (
            <button
              className="btn btn-dark btn-block"
              type="button"
              disabled={cannotCreate}
              onClick={() => onStart(protect ? password : '', cleanName(name), { share: false })}
            >
              Só criar a sala, espelhar depois
            </button>
          )}
        </form>
        )
        )}
      </section>

      {!IS_MOBILE && (
      <ol className="steps">
        {STEPS.map(([title, text], i) => (
          <Reveal as="li" key={title} delay={i * 120}>
            <h2>{title}</h2>
            <p>{text}</p>
          </Reveal>
        ))}
      </ol>
      )}
    </main>
  )
}

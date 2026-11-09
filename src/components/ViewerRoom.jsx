import { useState } from 'react'
import Chat from './Chat.jsx'
import Icon from './Icon.jsx'
import ChangeCode from './ChangeCode.jsx'
import CopyButton from './CopyButton.jsx'
import Participants from './Participants.jsx'
import Stage from './Stage.jsx'
import { useJoinSound } from '../hooks/useJoinSound.js'
import { CAN_SHARE } from '../lib/media.js'
import { roomLink } from '../lib/room.js'

function Message({ title, text, children }) {
  return (
    <div className="message" role="status">
      <h2>{title}</h2>
      {text && <p className="panel-text">{text}</p>}
      {children}
    </div>
  )
}

function PasswordPrompt({ error, onSubmit, onLeave }) {
  const [password, setPassword] = useState('')

  function submit(event) {
    event.preventDefault()
    if (password) onSubmit(password)
  }

  return (
    <div className="message">
      <h2>Esta sala tem senha</h2>
      <form className="panel-body" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Senha</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            autoFocus
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'password-error' : undefined}
          />
        </label>
        {error && (
          <p className="notice notice-error" id="password-error" role="alert">
            {error}
          </p>
        )}
        <div className="message-actions">
          <button className="btn btn-primary" type="submit" disabled={!password}>
            Entrar
          </button>
          <button className="btn btn-ghost" type="button" onClick={onLeave}>
            Voltar
          </button>
        </div>
      </form>
    </div>
  )
}

export default function ViewerRoom({
  code,
  status,
  stream,
  error,
  roster,
  meId,
  sharing,
  presenting,
  shareError,
  onStartShare,
  onStopShare,
  onRetry,
  onPassword,
  onLeave,
  onKick,
  onSetAdmin,
  onSetSharer,
  onStopGuest,
  onChangeCode,
  messages,
  onSendChat,
}) {
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  useJoinSound(roster.list, { selfId: meId })


  if (status === 'password') {
    return (
      <main className="room room-narrow">
        <PasswordPrompt error={error} onSubmit={onPassword} onLeave={onLeave} />
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="room room-narrow">
        <Message title="Não foi possível entrar" text={error}>
          <div className="message-actions">
            <button className="btn btn-primary" type="button" onClick={onRetry}>
              Tentar de novo
            </button>
            <button className="btn btn-ghost" type="button" onClick={onLeave}>
              Voltar
            </button>
          </div>
        </Message>
      </main>
    )
  }

  if (status === 'kicked') {
    return (
      <main className="room room-narrow">
        <Message title="Você foi removido da sala" text="Quem administra a sala removeu você. Você não consegue voltar com este acesso.">
          <div className="message-actions">
            <button className="btn btn-primary" type="button" onClick={onLeave}>
              Voltar ao início
            </button>
          </div>
        </Message>
      </main>
    )
  }

  if (status === 'ended') {
    return (
      <main className="room room-narrow">
        <Message title="A sala foi encerrada" text="Quem administrava a sala a encerrou ou saiu.">
          <div className="message-actions">
            <button className="btn btn-primary" type="button" onClick={onLeave}>
              Voltar ao início
            </button>
          </div>
        </Message>
      </main>
    )
  }

  const watching = status === 'watching'
  const waiting = status === 'waiting'
  const me = roster.list.find((p) => p.id === meId)
  const canShare = (Boolean(me?.share) || Boolean(me?.mod)) && CAN_SHARE
  const noAudio = !sharing.audio
  const othersSharing = sharing.active && sharing.byId !== meId
  const isAdmin = Boolean(me?.mod)
  const guestSharing = sharing.active && sharing.byId !== meId && sharing.byId !== 'host'

  return (
    <main className="room">
      <div className="room-bar">
        <div className="room-meta">
          <span className={watching ? 'badge badge-live' : 'badge'}>
            {presenting ? 'Você está espelhando' : watching ? 'Assistindo' : waiting ? 'Aguardando' : 'Conectando'}
          </span>
          <span className="meta mono">{code}</span>
        </div>
        <div className="room-actions">
          {canShare && (
            <button
              className={presenting ? 'btn btn-ghost' : 'btn btn-primary'}
              type="button"
              onClick={presenting ? () => onStopShare(true) : onStartShare}
              disabled={!presenting && othersSharing}
            >
              <Icon name="present" /> {presenting ? 'Parar de espelhar' : 'Espelhar minha tela'}
            </button>
          )}
          {isAdmin && guestSharing && (
            <button className="btn btn-ghost" type="button" onClick={onStopGuest}>
              Parar a tela de {sharing.byName}
            </button>
          )}
          {watching && !presenting && (
            <button className="btn btn-ghost" type="button" disabled={noAudio} onClick={() => setMuted(!muted)}>
              <Icon name={muted ? 'mute' : 'volume'} /> {muted ? 'Ativar som' : 'Silenciar'}
            </button>
          )}
          <button className="btn btn-ghost" type="button" onClick={onLeave}>
            <Icon name="exit" /> Sair
          </button>
        </div>
      </div>

      <div className="room-grid">
        <div className="stage-col">
          <Stage
            stream={stream}
            muted={presenting || muted}
            volume={volume}
            onBlocked={() => setMuted(true)}
            controls={
              watching &&
              !presenting && (
                <>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => setMuted(!muted)}
                    disabled={noAudio}
                    aria-label={muted ? 'Ativar som' : 'Silenciar'}
                    title={muted ? 'Ativar som' : 'Silenciar'}
                  >
                    <Icon name={muted ? 'mute' : 'volume'} />
                  </button>
                  <input
                    className="volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={muted ? 0 : volume}
                    disabled={noAudio}
                    aria-label="Volume"
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      setVolume(next)
                      setMuted(next === 0)
                    }}
                  />
                </>
              )
            }
            placeholder={
              <>
                <span className="spinner" aria-hidden="true" />
                <span role="status">
                  {waiting ? 'Aguardando alguém espelhar a tela. Você continua na sala.' : 'Conectando à sala…'}
                </span>
              </>
            }
          />
          {shareError && (
            <p className="notice notice-error" role="alert">
              {shareError}
            </p>
          )}
          {watching && !presenting && sharing.active && !sharing.audio && (
            <p className="side-note">Esta transmissão está sem áudio.</p>
          )}
          {watching && !presenting && muted && sharing.audio && (
            <p className="side-note">O som está desligado. Use "Ativar som" para ouvir.</p>
          )}
          {canShare && !presenting && !shareError && (
            <p className="side-note">Você pode espelhar a sua tela nesta sala.</p>
          )}
        </div>
        <aside className="side">
          {isAdmin && (
            <div className="invite">
              <h2>Você é admin da sala</h2>
              <p className="code" aria-label={`Código ${code.split('').join(' ')}`}>
                {code}
              </p>
              <div className="stack">
                <CopyButton text={roomLink(code)} icon="link" className="btn btn-primary btn-block">
                  Copiar link
                </CopyButton>
                <ChangeCode code={code} onChangeCode={onChangeCode} />
              </div>
              <p className="invite-note">
                Você pode remover pessoas, dar permissões e trocar o código, como o anfitrião. Só o anfitrião encerra
                a sala e ele não pode ser removido.
              </p>
            </div>
          )}
          <Chat messages={messages} meId={meId} onSend={onSendChat} />

          <Participants
            hostName={roster.host}
            hostPlace={roster.hostPlace}
            list={roster.list}
            meId={meId}
            canKick={(p) => isAdmin && p.id !== meId}
            onKick={onKick}
            onSetModerator={isAdmin ? onSetAdmin : undefined}
            onSetSharer={isAdmin ? onSetSharer : undefined}
          />
        </aside>
      </div>
    </main>
  )
}

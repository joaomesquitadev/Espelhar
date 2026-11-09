import CopyButton from './CopyButton.jsx'
import Chat from './Chat.jsx'
import ChangeCode from './ChangeCode.jsx'
import Icon from './Icon.jsx'
import Participants from './Participants.jsx'
import Stage from './Stage.jsx'
import { useState } from 'react'
import { useJoinSound } from '../hooks/useJoinSound.js'
import { CAN_SHARE, QUALITIES, captureSurface } from '../lib/media.js'
import { placeProblemText, roomLink } from '../lib/room.js'

export default function HostRoom({
  code,
  locked,
  name,
  place,
  placeError,
  quality,
  onSetQuality,
  participants,
  stream,
  source,
  error,
  audioFailed,
  onStop,
  onStopSharing,
  onStopGuest,
  onShareAgain,
  onKick,
  onSetModerator,
  onSetSharer,
  onChangeCode,
  messages,
  onSendChat,
}) {
  const [showPreview, setShowPreview] = useState(false)
  const hostSharing = source.active && source.byId === 'host'
  const guestSharing = source.active && !hostSharing
  useJoinSound(participants)
  // Previewing a whole screen inside a page that sits on that screen makes an endless mirror that freezes the
  // machine (worse with two monitors), so that preview stays off unless asked for.
  const mirrors = hostSharing && !showPreview && captureSurface(stream) === 'monitor'
  return (
    <main className="room">
      <div className="room-bar">
        <div className="room-meta">
          <span className={source.active ? 'badge badge-live' : 'badge'}>
            {hostSharing ? 'Ao vivo' : guestSharing ? `${source.byName} está espelhando` : 'Sala aberta, sem transmissão'}
          </span>
          {locked && (
            <span className="badge">
              <Icon name="lock" size={12} /> Com senha
            </span>
          )}
        </div>
        <div className="room-actions">
          {!hostSharing && CAN_SHARE && (
            <button className="btn btn-primary" type="button" onClick={() => onShareAgain()}>
              <Icon name="present" /> Espelhar minha tela
            </button>
          )}
          {hostSharing && (
            <button className="btn btn-ghost" type="button" onClick={onStopSharing}>
              Parar de espelhar
            </button>
          )}
          {guestSharing && (
            <button className="btn btn-ghost" type="button" onClick={onStopGuest}>
              Parar a tela de {source.byName}
            </button>
          )}
          <button className="btn btn-ghost" type="button" onClick={onStop}>
            Encerrar sala
          </button>
        </div>
      </div>

      <div className="room-grid">
        <div className="stage-col">
          <Stage
            stream={mirrors ? null : stream}
            placeholder={
              mirrors ? (
                <>
                  <span className="stage-empty-icon">
                    <Icon name="present" size={24} />
                  </span>
                  <span>Você está espelhando uma tela inteira. A prévia fica desligada para não criar o efeito espelho, que trava a transmissão.</span>
                  <button className="btn btn-dark" type="button" onClick={() => setShowPreview(true)}>
                    Mostrar prévia mesmo assim
                  </button>
                </>
              ) : (
                <>
                  <span className="stage-empty-icon">
                    <Icon name="present" size={24} />
                  </span>
                  <span className="stage-empty-title">Ninguém está espelhando</span>
                  <span>Quem entrar fica esperando na sala. Use "Espelhar minha tela" quando quiser começar.</span>
                </>
              )
            }
          />
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          {audioFailed && (
            <div className="message-actions">
              <button className="btn btn-primary" type="button" onClick={() => onShareAgain()}>
                Tentar de novo com áudio
              </button>
              <button className="btn btn-dark" type="button" onClick={() => onShareAgain({ audio: false })}>
                Espelhar sem áudio
              </button>
            </div>
          )}
          <div className="quality" role="group" aria-label="Qualidade da transmissão">
            <span className="field-label">Qualidade</span>
            <div className="quality-options">
              {Object.entries(QUALITIES).map(([key, q]) => (
                <button key={key} type="button" aria-pressed={quality === key} onClick={() => onSetQuality(key)}>
                  {q.label}
                </button>
              ))}
            </div>
            <span className="field-hint">
              {QUALITIES[quality].detail}. A internet de envio se divide entre todos que assistem.
            </span>
          </div>
          {hostSharing && !source.audio && (
            <p className="side-note">
              Sem áudio nesta transmissão. Ao escolher o que espelhar, deixe ligada a opção "Compartilhar áudio
              do sistema" (tela inteira) ou "Compartilhar áudio da aba" (aba do navegador). No Chrome ou Edge
              para Windows, janelas isoladas só trazem som nas versões mais novas.
            </p>
          )}
        </div>

        <aside className="side">
          <div className="invite">
            <h2>Convide quem vai assistir</h2>
            <p className="code" aria-label={`Código ${code.split('').join(' ')}`}>
              {code}
            </p>
            <div className="stack">
              <CopyButton text={roomLink(code)} icon="link" className="btn btn-primary btn-block">
                Copiar link
              </CopyButton>
              <CopyButton text={code} icon="copy" className="btn btn-dark btn-block">
                Copiar código
              </CopyButton>
              <ChangeCode code={code} onChangeCode={onChangeCode} />
            </div>
            <p className="invite-note">
              {locked ? 'Envie a senha por outro canal. ' : ''}Mantenha esta aba aberta: se você fechá-la, a
              sala fecha para todos. Parar de espelhar não tira ninguém da sala.
            </p>
          </div>

          <Chat messages={messages} meId="host" onSend={onSendChat} />

          <Participants
            hostName={name}
            hostPlace={place}
            list={participants}
            canKick={() => true}
            onKick={onKick}
            onSetModerator={onSetModerator}
            onSetSharer={onSetSharer}
          />
          {placeError && <p className="side-note">{placeProblemText(placeError)}</p>}
        </aside>
      </div>
    </main>
  )
}

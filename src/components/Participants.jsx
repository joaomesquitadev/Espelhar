import Icon from './Icon.jsx'

/**
 * Roster. `canKick(p)` decides whether the remove button shows for a row;
 * `onSetModerator` / `onSetSharer` are only passed to the host and to admins.
 */
export default function Participants({ hostName, hostPlace, list, meId, canKick, onKick, onSetModerator, onSetSharer }) {
  return (
    <section className="people" aria-label="Participantes">
      <h2 className="people-title">
        Na sala <span className="people-count">{list.length + 1}</span>
      </h2>
      <ul className="people-list">
        <li className="person">
          <span className="avatar" aria-hidden="true">
            {(hostName || 'A').charAt(0)}
          </span>
          <span className="person-name">
            {hostName || 'Anfitrião'}
            {hostPlace && <span className="person-place">{hostPlace}</span>}
          </span>
          <span className="tag tag-host">Anfitrião</span>
        </li>
        {list.map((p) => (
          <li className="person" key={p.id}>
            <span className="avatar" aria-hidden="true">
              {p.name.charAt(0)}
            </span>
            <span className="person-name">
              {p.name}
              {p.id === meId && <span className="person-you"> (você)</span>}
              {p.place && <span className="person-place">{p.place}</span>}
              {(p.mod || p.share) && (
                <span className="person-tags">
                  {p.mod && (
                    <span className="tag">
                      <Icon name="shield" size={12} /> Admin
                    </span>
                  )}
                  {p.share && !p.mod && (
                    <span className="tag">
                      <Icon name="present" size={12} /> Apresentador
                    </span>
                  )}
                </span>
              )}
            </span>
            <span className="person-actions">
              {onSetSharer && !p.mod && p.id !== meId && (
                <button
                  className="icon-btn"
                  type="button"
                  aria-pressed={p.share}
                  title={p.share ? 'Retirar permissão de espelhar' : 'Permitir que espelhe a tela'}
                  aria-label={`${p.share ? 'Retirar permissão de espelhar de' : 'Dar permissão de espelhar a'} ${p.name}`}
                  onClick={() => onSetSharer(p.id, !p.share)}
                >
                  <Icon name="present" />
                </button>
              )}
              {onSetModerator && p.id !== meId && (
                <button
                  className="icon-btn"
                  type="button"
                  aria-pressed={p.mod}
                  title={p.mod ? 'Retirar admin' : 'Tornar admin da sala'}
                  aria-label={`${p.mod ? 'Retirar admin de' : 'Tornar admin'} ${p.name}`}
                  onClick={() => onSetModerator(p.id, !p.mod)}
                >
                  <Icon name="shield" />
                </button>
              )}
              {canKick(p) && (
                <button
                  className="icon-btn icon-btn-danger"
                  type="button"
                  title="Remover da sala"
                  aria-label={`Remover ${p.name} da sala`}
                  onClick={() => onKick(p.id)}
                >
                  <Icon name="close" />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="people-empty">Ninguém entrou ainda. Envie o código ou o link.</p>}
    </section>
  )
}

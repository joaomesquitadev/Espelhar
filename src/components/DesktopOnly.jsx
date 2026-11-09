export default function DesktopOnly({ code }) {
  return (
    <div className="message desktop-only" role="alert">
        <svg className="desktop-art" viewBox="0 0 120 88" aria-hidden="true">
          <rect x="10" y="6" width="100" height="62" rx="8" className="art-screen" />
          <path d="M44 82h32M60 68v14" className="art-stand" />
          <path d="M26 22v-4a2 2 0 0 1 2-2h4M88 16h4a2 2 0 0 1 2 2v4M94 52v4a2 2 0 0 1-2 2h-4M32 58h-4a2 2 0 0 1-2-2v-4" className="art-corners" />
          <circle cx="60" cy="37" r="5" className="art-dot" />
        </svg>
        <h2>Abra a sala em um computador</h2>
        <p className="panel-text">
          O Espelhar funciona só no computador. No celular não dá para criar uma sala, entrar em uma, assistir nem espelhar.
        </p>
        {code && (
          <p className="desktop-code">
            <span className="field-label">Código da sala</span>
            <span className="mono">{code}</span>
          </p>
        )}
        <p className="field-hint">Abra o Espelhar no navegador do seu computador{code ? ' e use o código acima' : ''}.</p>
    </div>
  )
}

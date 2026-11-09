import Logo from './Logo.jsx'

export default function Header({ onHome }) {
  return (
    <header className="header">
      <div className="header-inner">
        <button className="brand" type="button" onClick={onHome} aria-label="Espelhar, voltar ao início">
          <Logo />
          Espelhar
        </button>
      </div>
    </header>
  )
}

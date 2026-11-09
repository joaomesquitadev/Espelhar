import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

export default function CopyButton({ text, icon, children, className = 'btn btn-ghost' }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copie manualmente:', text)
    }
  }

  return (
    <button className={className} type="button" onClick={copy}>
      <Icon name={copied ? 'check' : icon} />
      <span aria-live="polite">{copied ? 'Copiado' : children}</span>
    </button>
  )
}

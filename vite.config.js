import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/** Fills the absolute URLs that link previews need. Set VITE_SITE_URL (no trailing slash) for the deployed site. */
function siteUrl(mode) {
  // Netlify exposes the site's address as URL during its builds, so a deploy there works without any setup.
  const site = (loadEnv(mode, process.cwd(), '').VITE_SITE_URL || process.env.URL || '').replace(/\/$/, '')
  return {
    name: 'site-url',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', site),
  }
}

// Only what the app really talks to: the PeerJS signalling server and the city lookup.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:", // o Vite embute fontes pequenas como data: URI
  "media-src 'self' blob:",
  "connect-src 'self' https://0.peerjs.com wss://0.peerjs.com https://api.ipgeolocation.io",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

/** Content-Security-Policy for the built site. Left out of `vite dev`, whose hot reload needs inline scripts. */
function contentSecurityPolicy() {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  }
}

export default defineConfig(({ mode }) => ({ plugins: [react(), siteUrl(mode), contentSecurityPolicy()] }))

import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// https://vite.dev/config/
//
// `npm run dev:phone` serves the app over HTTPS on your Wi-Fi network, so it
// can be tested on a phone. Browsers only share location with secure pages
// (https, or localhost), so the plain `npm run dev` address on a phone
// (http://192.168…) can never get GPS. The certificate is self-signed: the
// phone shows a warning once; continue past it.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
  server: mode === 'phone' ? { host: true } : undefined,
}))

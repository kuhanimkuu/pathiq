// The floating navigation window: while navigating, the next turn, its
// distance and the ETA in a small always-on-top window (Picture-in-Picture),
// so the directions stay on screen when the driver goes to another app, as
// with Google Maps.
//
// Browsers only float <video>, so the card is drawn on a canvas and played
// as a muted video of that canvas. It opens from the Float button (a tap is
// needed) and, where the browser allows it, by itself when the app goes to
// the background: Chrome's automatic picture-in-picture (Media Session
// "enterpictureinpicture") and Safari's autoPictureInPicture. Where the
// window goes on screen is up to the phone; the driver can drag it.
//
// A web page can't keep its GPS running everywhere once it's in the
// background, so the window shows the last directions it got and updates
// whenever the page does.

const W = 480
const H = 270
const TEAL = '#00C9A7'
const INK = '#050D0B'

export function pipSupported() {
  return (
    typeof document !== 'undefined' &&
    document.pictureInPictureEnabled === true &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  )
}

// Word-wraps `text` into at most `maxLines` lines of `width` px.
function wrap(ctx, text, width, maxLines) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= width || !line) {
      line = next
    } else {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1]
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last}…`
  }
  return lines
}

// One floating window for the page. `onChange(open)` hears it open and close.
export function createPipNavigator({ onChange } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.autoplay = true
  video.setAttribute('autopictureinpicture', '')
  video.autoPictureInPicture = true // Safari: float on its own when the app is left
  // Browsers won't float a video that isn't in the page; this one is there but invisible.
  Object.assign(video.style, { position: 'fixed', left: '0', bottom: '0', width: '2px', height: '2px', opacity: '0.01', pointerEvents: 'none' })
  video.setAttribute('aria-hidden', 'true')
  document.body.appendChild(video)

  const icons = new Map() // svg markup → loaded Image
  let info = null
  let started = false

  const isOpen = () => document.pictureInPictureElement === video
  const changed = () => onChange?.(isOpen())
  video.addEventListener('enterpictureinpicture', changed)
  video.addEventListener('leavepictureinpicture', changed)

  function icon(svg) {
    if (!svg) return null
    let img = icons.get(svg)
    if (!img) {
      img = new Image()
      img.onload = () => paint()
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      icons.set(svg, img)
    }
    return img.complete && img.naturalWidth ? img : null
  }

  function paint() {
    const d = info ?? { distance: '', instruction: 'PathIQ navigation' }
    ctx.fillStyle = INK
    ctx.fillRect(0, 0, W, H)
    // The turn: icon tile, distance, instruction.
    ctx.fillStyle = TEAL
    ctx.beginPath()
    ctx.roundRect(20, 20, 112, 112, 22)
    ctx.fill()
    const img = icon(d.iconSvg)
    if (img) ctx.drawImage(img, 36, 36, 80, 80)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '700 52px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(d.distance ?? '', 150, 24, W - 170)
    ctx.font = '600 25px system-ui, sans-serif'
    wrap(ctx, d.instruction, W - 170, 2).forEach((line, i) => ctx.fillText(line, 150, 86 + i * 30))
    // A road report or alert, when there is one.
    if (d.alert) {
      ctx.fillStyle = '#F59E0B'
      ctx.font = '700 22px system-ui, sans-serif'
      ctx.fillText(wrap(ctx, d.alert, W - 40, 1)[0] ?? '', 20, 158)
    }
    // ETA strip.
    ctx.fillStyle = '#12211D'
    ctx.fillRect(0, H - 70, W, 70)
    ctx.fillStyle = TEAL
    ctx.font = '700 30px system-ui, sans-serif'
    ctx.fillText(d.eta ?? '', 20, H - 54, W / 2)
    const etaW = Math.min(W / 2, ctx.measureText(d.eta ?? '').width + 16)
    ctx.fillStyle = '#B7C4C0'
    ctx.font = '500 20px system-ui, sans-serif'
    ctx.fillText(wrap(ctx, d.sub ?? '', W - etaW - 40, 1)[0] ?? '', 20 + etaW, H - 48)
  }

  function start() {
    if (started) return
    started = true
    paint()
    video.srcObject = canvas.captureStream(5)
    video.play().catch(() => {})
    // Chrome: float by itself when the driver leaves the app, where allowed.
    try {
      navigator.mediaSession?.setActionHandler('enterpictureinpicture', () => open())
    } catch {
      // not supported here; the Float button still works
    }
    if ('mediaSession' in navigator && 'MediaMetadata' in window) {
      navigator.mediaSession.metadata = new window.MediaMetadata({ title: 'PathIQ navigation', artist: 'PathIQ' })
    }
  }

  // Must run from a tap (browsers only open picture-in-picture for one).
  async function open() {
    start()
    if (isOpen()) return true
    try {
      if (video.readyState < 1) await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }))
      await video.requestPictureInPicture()
      return true
    } catch {
      return false
    }
  }

  async function close() {
    if (isOpen()) await document.exitPictureInPicture().catch(() => {})
  }

  return {
    // { distance, instruction, iconSvg, eta, sub, alert }
    update(next) {
      info = next
      if (started) paint()
    },
    start,
    open,
    close,
    isOpen,
    destroy() {
      close()
      try {
        navigator.mediaSession?.setActionHandler('enterpictureinpicture', null)
      } catch {
        // nothing registered
      }
      video.srcObject?.getTracks().forEach((t) => t.stop())
      video.remove()
    },
  }
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Check, Download } from 'lucide-react'
import { fetchPublishedPosts, formatPostDate } from '../../../lib/company'
import usePageTitle from './usePageTitle'
import './company.css'

const BOILERPLATE =
  'PathIQ Navigators is a map and navigation app that helps drivers choose better routes using real road ' +
  'conditions. It combines community road reports verified by paid local Scouts, community-verified places ' +
  '(Hidden Gems), and anonymous, opt-in driving data. PathIQ is built in Nairobi, Kenya, and works anywhere.'

const ASSETS = [
  { file: '/icons/icon.svg', name: 'App icon (SVG)', note: 'Vector, any size' },
  { file: '/icons/icon-512.png', name: 'App icon (PNG)', note: '512 × 512' },
  { file: '/og-image.png', name: 'Social image', note: '1200 × 630', wide: true },
]

// From the logo (components/Logo.jsx).
const COLOURS = [
  { hex: '#00D9B4', name: 'PathIQ teal' },
  { hex: '#007A66', name: 'Deep teal' },
  { hex: '#FFB020', name: 'Gem amber' },
  { hex: '#04211C', name: 'Road' },
]

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }
    >
      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy text'}
    </button>
  )
}

export default function PressPage() {
  usePageTitle('Press')
  const [posts, setPosts] = useState([])
  useEffect(() => {
    let cancelled = false
    fetchPublishedPosts()
      .then(({ rows }) => !cancelled && setPosts(rows.slice(0, 3)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <section className="section company-hero">
        <div className="pill pill-green">Press</div>
        <h1>Press and media</h1>
        <p className="lede">
          Writing about PathIQ? Here&apos;s a short description, key facts and brand assets you&apos;re welcome to use.
          For interviews, data or anything else, send us a message.
        </p>
        <div className="hero-ctas">
          <Link to="/contact?topic=press" className="btn btn-primary btn-lg">Media enquiries</Link>
        </div>
      </section>

      <section className="section company-section">
        <div className="company-split">
          <div>
            <h2>About PathIQ</h2>
            <p className="boilerplate">{BOILERPLATE}</p>
            <CopyButton text={BOILERPLATE} />
          </div>
          <div>
            <h2>Key facts</h2>
            <dl className="fact-list">
              <dt>Name</dt>
              <dd>PathIQ Navigators</dd>
              <dt>Based in</dt>
              <dd>Nairobi, Kenya</dd>
              <dt>What it is</dt>
              <dd>Map and navigation app with road-condition intelligence</dd>
              <dt>Available on</dt>
              <dd>The web, installable as an app on Android and iPhone</dd>
              <dt>Community</dt>
              <dd>Scouts verify roads and places and are paid per approved task (M-Pesa in Kenya)</dd>
              <dt>Privacy</dt>
              <dd>
                Location sharing is opt-in and anonymous. <Link to="/privacy#road-data" className="c-green">How it works</Link>
              </dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="section company-section">
        <h2>Brand assets</h2>
        <p className="section-sub">
          Please don&apos;t change the logo&apos;s colours or proportions. Write the name as &ldquo;PathIQ&rdquo;, with a
          capital I and Q.
        </p>
        <div className="company-grid">
          {ASSETS.map((a) => (
            <div className="company-card" key={a.file}>
              <div className="asset-preview">
                <img src={a.file} alt="" className={a.wide ? 'wide' : ''} />
              </div>
              <h3>{a.name}</h3>
              <p>{a.note}</p>
              <a href={a.file} download className="btn btn-outline">
                <Download size={15} /> Download
              </a>
            </div>
          ))}
        </div>
        <div className="swatches" style={{ marginTop: 24 }}>
          {COLOURS.map((c) => (
            <div className="swatch" key={c.hex}>
              <span style={{ background: c.hex }} />
              <span>
                {c.name}
                <br />
                <code>{c.hex}</code>
              </span>
            </div>
          ))}
        </div>
      </section>

      {posts.length > 0 && (
        <section className="section company-section">
          <h2>Latest from the blog</h2>
          <p className="section-sub">Product news and updates, as we publish them.</p>
          <div className="blog-grid">
            {posts.map((p) => (
              <Link to={`/blog/${p.slug}`} className="blog-card" key={p.id}>
                <div className="blog-card-body">
                  <span className="blog-card-date">{formatPostDate(p.published_at)}</span>
                  <h3>{p.title}</h3>
                  {p.excerpt && <p>{p.excerpt}</p>}
                  <span className="blog-card-more">Read more →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

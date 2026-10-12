import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, LifeBuoy, Newspaper, Footprints } from 'lucide-react'
import { CONTACT_TOPICS, submitContactMessage } from '../../../lib/company'
import usePageTitle from './usePageTitle'
import './company.css'

const TOPICS = new Set(CONTACT_TOPICS.map((t) => t.value))

export default function ContactPage() {
  usePageTitle('Contact')
  const [params] = useSearchParams()
  const initialTopic = TOPICS.has(params.get('topic')) ? params.get('topic') : 'general'
  const [form, setForm] = useState({ name: '', email: '', topic: initialTopic, message: '', website: '' })
  const [state, setState] = useState('idle') // idle | sending | sent
  const [error, setError] = useState('')
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    // Filled only by bots (the field is hidden from people): look sent, send nothing.
    if (form.website) {
      setState('sent')
      return
    }
    if (form.message.trim().length < 10) {
      setError('Please write a little more, at least 10 characters.')
      return
    }
    setState('sending')
    try {
      await submitContactMessage(form)
      setState('sent')
    } catch (err) {
      setError(
        err.code === 'PT429' || err.status === 429
          ? 'Too many messages from your connection in the last hour. Please try again later.'
          : 'Your message couldn’t be sent. Check your details and try again.',
      )
      setState('idle')
    }
  }

  return (
    <>
      <section className="section company-hero">
        <div className="pill pill-green">Contact</div>
        <h1>Talk to us</h1>
        <p className="lede">
          Questions, feedback, partnership ideas or a road we should know about. Send a message and the team will
          reply by email.
        </p>
      </section>

      <section className="section company-section">
        <div className="contact-layout">
          {state === 'sent' ? (
            <div className="contact-form contact-sent" role="status">
              <div className="company-card-icon"><CheckCircle2 size={22} /></div>
              <h2>Message sent</h2>
              <p>Thanks for getting in touch. We&apos;ll reply to {form.email || 'you'} as soon as we can.</p>
              <div className="hero-ctas" style={{ justifyContent: 'center', marginTop: 18 }}>
                <Link to="/app" className="btn btn-primary">Open the map</Link>
              </div>
            </div>
          ) : (
            <form className="contact-form" onSubmit={submit}>
              <div className="contact-row">
                <label className="contact-field">
                  Your name
                  <input className="auth-input" required maxLength={100} autoComplete="name" value={form.name} onChange={set('name')} />
                </label>
                <label className="contact-field">
                  Email
                  <input className="auth-input" type="email" required maxLength={254} autoComplete="email" value={form.email} onChange={set('email')} />
                </label>
              </div>
              <label className="contact-field">
                What&apos;s it about?
                <select className="auth-input" value={form.topic} onChange={set('topic')}>
                  {CONTACT_TOPICS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label className="contact-field">
                Message
                <textarea className="auth-input" required minLength={10} maxLength={5000} rows={7} value={form.message} onChange={set('message')} />
                <small>{form.message.length} / 5000</small>
              </label>
              {/* Honeypot for bots; hidden from people and screen readers. */}
              <label className="contact-hp" aria-hidden="true">
                Website
                <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
              </label>
              {error && <p className="contact-error" role="alert">{error}</p>}
              <button type="submit" className="btn btn-primary btn-lg" disabled={state === 'sending'}>
                {state === 'sending' ? 'Sending…' : 'Send message'}
              </button>
              <p className="contact-note">
                We use what you send only to reply to you. Handled messages are deleted after a year. See our{' '}
                <Link to="/privacy#contact">privacy policy</Link>.
              </p>
            </form>
          )}

          <aside className="contact-aside">
            <div className="company-card">
              <div className="company-card-icon"><LifeBuoy size={20} /></div>
              <h3>Help with the app</h3>
              <p>Choose &ldquo;Help with the app&rdquo; and tell us what you were doing, and on which phone or browser.</p>
            </div>
            <div className="company-card">
              <div className="company-card-icon"><Footprints size={20} /></div>
              <h3>Scouts</h3>
              <p>Want to verify roads and places and get paid for it? Apply from your profile in the app.</p>
              <Link to="/scout-program" className="btn btn-outline">Scout program</Link>
            </div>
            <div className="company-card">
              <div className="company-card-icon"><Newspaper size={20} /></div>
              <h3>Press</h3>
              <p>Facts, a short description and logos are on the press page.</p>
              <Link to="/press" className="btn btn-outline">Press kit</Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  )
}

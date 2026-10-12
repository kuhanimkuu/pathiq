import { Link } from 'react-router-dom'
import { Car, MessagesSquare, Scale, Sprout, MapPin } from 'lucide-react'
import usePageTitle from './usePageTitle'
import './company.css'

const howWeWork = [
  {
    Icon: Car,
    title: 'We use what we build',
    text: 'Everyone drives with PathIQ. If a route is wrong or a report is stale, we feel it on the way to work.',
  },
  {
    Icon: MessagesSquare,
    title: 'Plain words, written down',
    text: 'Decisions, plans and trade-offs are written so anyone can follow them, ask about them, and disagree with them.',
  },
  {
    Icon: Scale,
    title: 'Data with care',
    text: 'Location data is personal. We collect less, keep it for less time, and say exactly what we do with it.',
  },
  {
    Icon: Sprout,
    title: 'Small team, real ownership',
    text: 'You will own whole problems, from the first sketch to the version drivers use, and see the result on the road.',
  },
]

export default function CareersPage() {
  usePageTitle('Careers')
  return (
    <>
      <section className="section company-hero">
        <div className="pill pill-green">Careers</div>
        <h1>Help build the map that knows the road.</h1>
        <p className="lede">
          We&apos;re a small team in Nairobi building navigation and road intelligence from the ground up: maps,
          routing, data and the community of Scouts who keep it true.
        </p>
      </section>

      <section className="section company-section">
        <h2>How we work</h2>
        <p className="section-sub">What you can expect from us, and what we expect from each other.</p>
        <div className="company-grid">
          {howWeWork.map(({ Icon, title, text }) => (
            <div className="company-card" key={title}>
              <div className="company-card-icon"><Icon size={20} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section company-section" id="roles">
        <h2>Open roles</h2>
        <div className="company-empty">
          <h3>No open roles right now</h3>
          <p>
            We&apos;re not hiring for a specific role at the moment. If you work on maps, mobile, data or community and
            think you could help, we&apos;d still like to hear from you. Tell us what you&apos;d work on and share a link
            to something you&apos;ve made.
          </p>
          <Link to="/contact?topic=careers" className="btn btn-primary">Introduce yourself</Link>
        </div>
      </section>

      <section className="section company-section">
        <div className="company-cta">
          <div>
            <h2>Prefer working in the field?</h2>
            <p>
              <MapPin size={15} style={{ verticalAlign: '-2px' }} /> Scouts verify roads and places near them and are
              paid for every approved task. No office, set your own hours.
            </p>
          </div>
          <div className="hero-ctas">
            <Link to="/scout-program" className="btn btn-amber">Become a Scout</Link>
          </div>
        </div>
      </section>
    </>
  )
}

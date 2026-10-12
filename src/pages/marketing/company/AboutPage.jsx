import { Link } from 'react-router-dom'
import { Route, TriangleAlert, Gem, Map as MapIcon, Footprints, ShieldCheck, HandCoins, Globe } from 'lucide-react'
import usePageTitle from './usePageTitle'
import './company.css'

const building = [
  {
    Icon: Route,
    title: 'Navigation that reads the road',
    text: 'Routes are compared on travel time and on the condition of the road itself, so you can pick the drive that is fast, smooth, or both.',
  },
  {
    Icon: TriangleAlert,
    title: 'Live road intelligence',
    text: 'Potholes, flooding, closures and crashes, reported by drivers and checked by Scouts, then painted onto the route you are about to take.',
  },
  {
    Icon: Gem,
    title: 'Hidden Gems',
    text: 'Places worth stopping for, found and verified by people who know the area, and suggested when they are close to your route.',
  },
  {
    Icon: MapIcon,
    title: 'A map that keeps learning',
    text: 'With drivers’ permission, anonymous road speeds and road shapes build up into PathIQ’s own picture of how roads really behave.',
  },
]

const principles = [
  {
    Icon: Footprints,
    title: 'Ground truth first',
    text: 'What people on the road see beats what a model guesses. Reports are verified before they shape anyone’s route.',
  },
  {
    Icon: ShieldCheck,
    title: 'Private by design',
    text: 'Location sharing is off unless you turn it on, carries no account, and raw points are deleted within 90 days. We build road data, not profiles.',
  },
  {
    Icon: HandCoins,
    title: 'Pay people for their work',
    text: 'Scouts are paid for every approved task, starting with M-Pesa in Kenya, because good local data takes real time and effort.',
  },
  {
    Icon: Globe,
    title: 'Built at home, made for everywhere',
    text: 'We started with Nairobi’s roads because we drive them every day. The app works anywhere, and the data grows wherever people use it.',
  },
]

export default function AboutPage() {
  usePageTitle('About')
  return (
    <>
      <section className="section company-hero">
        <div className="pill pill-green">About PathIQ</div>
        <h1>Maps that know the road, not just the route.</h1>
        <p className="lede">
          PathIQ Navigators is a map and navigation app built around one idea: the best route depends on what the road
          is actually like today. We combine community road reports, verified local places and anonymous driving data
          into road intelligence you can use on every trip.
        </p>
        <div className="hero-ctas">
          <Link to="/app" className="btn btn-primary btn-lg">Open the map</Link>
          <Link to="/contact" className="btn btn-outline btn-lg">Get in touch</Link>
        </div>
      </section>

      <section className="section company-section">
        <div className="company-split">
          <h2>Why we started</h2>
          <div>
            <p>
              Anyone who drives in Nairobi knows the gap. Your map can tell you the traffic, but not that the shortcut
              it suggests has a crater in the middle lane, floods after an hour of rain, or was closed this morning for
              works. Those details decide whether a trip goes well, and the people who know them are the ones driving,
              walking and working on those roads every day.
            </p>
            <p>
              PathIQ turns that local knowledge into something every driver can use. Drivers report what they see,
              Scouts verify it on the ground, and routes are scored on the result. Along the way, the same community
              finds the places worth stopping for.
            </p>
          </div>
        </div>
      </section>

      <section className="section company-section">
        <h2>What we&apos;re building</h2>
        <p className="section-sub">Navigation today, and a full map built on our own data over time.</p>
        <div className="company-grid">
          {building.map(({ Icon, title, text }) => (
            <div className="company-card" key={title}>
              <div className="company-card-icon"><Icon size={20} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section company-section">
        <h2>How we work</h2>
        <p className="section-sub">The principles behind the product, and the decisions we make about data.</p>
        <div className="company-grid">
          {principles.map(({ Icon, title, text }) => (
            <div className="company-card" key={title}>
              <div className="company-card-icon"><Icon size={20} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section company-section">
        <div className="company-cta">
          <div>
            <h2>Help map the roads you know</h2>
            <p>Become a Scout and get paid to verify roads and places near you, or read what we&apos;re working on.</p>
          </div>
          <div className="hero-ctas">
            <Link to="/scout-program" className="btn btn-amber">Become a Scout</Link>
            <Link to="/blog" className="btn btn-outline">Read the blog</Link>
          </div>
        </div>
      </section>
    </>
  )
}

import { Link } from 'react-router-dom'

const steps = [
  { n: '01', title: 'Receive task', desc: 'Scout receives a nearby verification task with GPS location', color: 'green' },
  { n: '02', title: 'Field visit', desc: 'Scout travels to the location and captures photos and GPS', color: 'amber' },
  { n: '03', title: 'AI validation', desc: 'AI analyzes photos and pre-fills condition data', color: 'blue' },
  { n: '04', title: 'Submission', desc: 'Scout reviews and submits the verified report', color: 'purple' },
  { n: '05', title: 'M-Pesa payment', desc: 'Approved submissions are paid directly via M-Pesa', color: 'green' },
]

export default function ScoutProgramSection() {
  return (
    <section id="scout-program" className="section scout">
      <div className="scout-inner">
        <div className="scout-copy">
          <div className="pill pill-amber">Scout Program</div>
          <h2>Built by people on the ground.</h2>
          <p>
            PathIQ Scouts are paid contributors who verify roads, discover local places and keep our data
            accurate and current. Scouts earn via M-Pesa for every approved task.
          </p>

          <div className="earnings-card">
            <div className="earnings-label">Scout earnings example</div>
            <div className="earnings-grid">
              <div className="earnings-row">
                <span>Road condition report</span>
                <span className="earnings-amount">KSh 150</span>
              </div>
              <div className="earnings-row">
                <span>Place verification</span>
                <span className="earnings-amount">KSh 200</span>
              </div>
              <div className="earnings-row">
                <span>Hidden Gem discovery</span>
                <span className="earnings-amount">KSh 350</span>
              </div>
              <div className="earnings-row">
                <span>Flood zone survey</span>
                <span className="earnings-amount">KSh 500</span>
              </div>
            </div>
          </div>

          <Link to="/app/profile" className="btn btn-amber">
            Join as a Scout &rarr;
          </Link>
        </div>

        <div className="scout-steps">
          {steps.map((s) => (
            <div className="step-card" key={s.n}>
              <span className={`step-num step-${s.color}`}>{s.n}</span>
              <div>
                <div className="step-title">{s.title}</div>
                <div className="step-desc">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

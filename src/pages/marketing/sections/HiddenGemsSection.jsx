import { Link } from 'react-router-dom'
import { Star, MapPin, BadgeCheck } from 'lucide-react'

const gems = [
  { name: "Mama Njeri's Kitchen", cat: 'Local Food', rating: '4.9', desc: 'Famous tilapia. Cash only.', dist: '2.1 km away', img: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop' },
  { name: 'Ngong Forest Trails', cat: 'Nature', rating: '4.8', desc: 'Peaceful forest walk. Free entry.', dist: '8.4 km away', img: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=300&fit=crop' },
  { name: 'Kariokor Market', cat: 'Culture', rating: '4.6', desc: 'Every Friday. Authentic crafts.', dist: '3.8 km away', img: 'https://images.unsplash.com/photo-1489516408517-0c0a15662682?w=400&h=300&fit=crop' },
  { name: 'Fourteen Falls', cat: 'Scenic', rating: '4.9', desc: "Kenya's widest waterfall.", dist: '48 km away', img: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=400&h=300&fit=crop' },
]

export default function HiddenGemsSection() {
  return (
    <section id="hidden-gems" className="section gems">
      <div className="pill pill-green center">Hidden Gems</div>
      <h2 className="center">Discover the Kenya that maps don&apos;t always show.</h2>
      <p className="section-sub center">
        Local restaurants, hidden trails, scenic spots and authentic markets &mdash; all verified by Scouts on the
        ground and backed by community ratings.
      </p>

      <div className="gems-grid">
        {gems.map((g) => (
          <div className="gem-card" key={g.name}>
            <div className="gem-img" style={{ backgroundImage: `url(${g.img})` }}>
              <span className="gem-verified"><BadgeCheck size={13} /> Scout Verified</span>
            </div>
            <div className="gem-body">
              <div className="gem-meta-row">
                <span className="gem-cat">{g.cat}</span>
                <span className="gem-rating"><Star size={13} fill="currentColor" stroke="none" /> {g.rating}</span>
              </div>
              <div className="gem-name">{g.name}</div>
              <div className="gem-desc">{g.desc}</div>
              <div className="gem-dist"><MapPin size={12} /> {g.dist}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="center">
        <Link to="/app/gems" className="btn btn-outline">
          Explore all Hidden Gems
        </Link>
      </div>
    </section>
  )
}

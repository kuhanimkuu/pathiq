import { useState } from 'react'
import { allGems, gemCategories } from '../data/mockData'

function Gems() {
  const [activeCategory, setActiveCategory] = useState('All')

  const filteredGems =
    activeCategory === 'All'
      ? allGems
      : allGems.filter((gem) => gem.category === activeCategory)

  return (
    <div className="gems-page">
      <h1 className="page-title">Hidden Gems</h1>

      <div className="filter-row">
        {gemCategories.map((category) => (
          <button
            key={category}
            className={'filter-chip' + (category === activeCategory ? ' active' : '')}
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="section-card">
        <div className="section-title">{filteredGems.length} gems found</div>
        {filteredGems.map((gem) => (
          <div key={gem.id} className="list-row">
            <div>
              <div className="list-row-title">{gem.name}</div>
              <div className="list-row-sub">{gem.category} · {gem.detour} detour · {gem.votes} confirmations</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Gems
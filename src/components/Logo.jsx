import { useId } from 'react'

// The PathIQ Navigators logo: a road winding up to a Hidden Gem, on the teal
// tile. The full mark (dashed centre line, faceted gem) is for 32px and up;
// `simple` drops the fine detail for small sizes. The same drawing is in
// public/favicon.svg and public/icons/*.svg.
export function LogoMark({ size = 28, simple = size < 32, title }) {
  const id = useId()
  const road = 'M15 51 C15 43, 21 40, 27 38 C34 35.5, 44.5 36, 45 25'
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00D9B4" />
          <stop offset="1" stopColor="#007A66" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id}-tile)`} />
      <path d={road} fill="none" stroke="#04211C" strokeWidth={simple ? 8 : 9} strokeLinecap="round" strokeLinejoin="round" />
      {!simple && (
        <path d={road} fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeDasharray="3.2 3.2" strokeLinecap="round" />
      )}
      <path d="M45 4 L55.5 14.5 L45 25 L34.5 14.5 Z" fill="#FFB020" stroke="#04211C" strokeWidth="3" strokeLinejoin="round" />
      {!simple && <path d="M45 4 L45 25" stroke="#04211C" strokeWidth="1.4" opacity=".45" />}
    </svg>
  )
}

// Mark plus wordmark: "PathIQ" (IQ in the brand teal) and "Navigators".
//   short   "PathIQ" only, for tight spaces
function Logo({ size = 28, short = false, className = '' }) {
  return (
    <span className={'logo ' + className}>
      <LogoMark size={size} />
      <span className="logo-name">
        Path<span className="logo-iq">IQ</span>
        {!short && <span className="logo-sub"> Navigators</span>}
      </span>
    </span>
  )
}

export default Logo

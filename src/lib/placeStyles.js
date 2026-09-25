import {
  Landmark, BedDouble, UtensilsCrossed, Mountain, Fuel, Toilet,
  ArrowDownToDot, Waves, Construction, Activity, Siren,
} from 'lucide-react'
import { severityBand } from './roadReports'

// PathIQ's own icon set for its data: one colour + glyph per Hidden Gem
// category, one glyph per road-report type (coloured by severity). Used for
// the map markers and everywhere a gem or report is listed, so a category
// looks the same on every screen. Colours are real hex values because map
// markers live outside the app's CSS variables; they're chosen to read on
// both the dark and light map.

export const GEM_STYLE = {
  attractions: { label: 'Attractions', color: '#EC4899', Icon: Landmark },
  hotels: { label: 'Hotels', color: '#3B82F6', Icon: BedDouble },
  food: { label: 'Food', color: '#F97316', Icon: UtensilsCrossed },
  scenic: { label: 'Scenic', color: '#22C55E', Icon: Mountain },
  fuel: { label: 'Fuel', color: '#EAB308', Icon: Fuel },
  facilities: { label: 'Facilities', color: '#8B5CF6', Icon: Toilet },
}
const GEM_FALLBACK = { label: 'Gem', color: '#00C9A7', Icon: Landmark }

export const REPORT_STYLE = {
  pothole: { label: 'Pothole', Icon: ArrowDownToDot },
  flooding: { label: 'Flooding', Icon: Waves },
  construction: { label: 'Construction', Icon: Construction },
  surface: { label: 'Rough surface', Icon: Activity },
  incident: { label: 'Accident / incident', Icon: Siren },
}
const REPORT_FALLBACK = { label: 'Road report', Icon: Siren }

// Mirrors --red / --amber / --blue.
export const SEVERITY_COLOR = { high: '#EF4444', medium: '#F59E0B', low: '#3B82F6' }

export const gemStyle = (category) => GEM_STYLE[category] ?? GEM_FALLBACK
export const reportStyle = (type) => REPORT_STYLE[type] ?? REPORT_FALLBACK
export const severityColor = (severity) => SEVERITY_COLOR[severityBand(severity)]

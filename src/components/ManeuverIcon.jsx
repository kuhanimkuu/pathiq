import {
  ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Undo2, Redo2,
  RotateCcw, RotateCw, Merge, Split, Flag, Ship, Navigation,
} from 'lucide-react'

// Google Routes API manoeuvre names → icons. Used in the navigation banner,
// the written directions and the turn markers on the route.
const ICONS = {
  DEPART: Navigation,
  TURN_LEFT: CornerUpLeft,
  TURN_SHARP_LEFT: CornerUpLeft,
  TURN_SLIGHT_LEFT: ArrowUpLeft,
  TURN_RIGHT: CornerUpRight,
  TURN_SHARP_RIGHT: CornerUpRight,
  TURN_SLIGHT_RIGHT: ArrowUpRight,
  UTURN_LEFT: Undo2,
  UTURN_RIGHT: Redo2,
  RAMP_LEFT: ArrowUpLeft,
  RAMP_RIGHT: ArrowUpRight,
  FORK_LEFT: Split,
  FORK_RIGHT: Split,
  MERGE: Merge,
  ROUNDABOUT_LEFT: RotateCcw,
  ROUNDABOUT_RIGHT: RotateCw,
  FERRY: Ship,
  FERRY_TRAIN: Ship,
  ARRIVE: Flag,
}

function ManeuverIcon({ maneuver, size = 18, ...props }) {
  const Icon = ICONS[maneuver] ?? ArrowUp
  return <Icon size={size} {...props} />
}

export default ManeuverIcon

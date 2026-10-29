import {
  ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Undo2, Redo2,
  RotateCcw, RotateCw, Merge, Flag, Ship, Bus, TrainFront,
} from 'lucide-react'

// Google Routes API manoeuvre names → icons. Used in the navigation banner,
// the written directions and the turn markers on the route. "Up" is always
// the way you're driving (the map turns heading-up while navigating, and the
// turn markers are turned to the road), so setting off and carrying straight
// on are a plain up arrow, never a diagonal that can read as backwards.
const ICONS = {
  DEPART: ArrowUp,
  STRAIGHT: ArrowUp,
  NAME_CHANGE: ArrowUp,
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
  // Keep left / keep right at a fork: Lucide's fork icon is symmetrical, so
  // it couldn't say which way.
  FORK_LEFT: ArrowUpLeft,
  FORK_RIGHT: ArrowUpRight,
  MERGE: Merge,
  ROUNDABOUT_LEFT: RotateCcw,
  ROUNDABOUT_RIGHT: RotateCw,
  FERRY: Ship,
  FERRY_TRAIN: Ship,
  ARRIVE: Flag,
}

// A ride on public transport (routes function: TRANSIT_<vehicle type>).
const isBus = (maneuver) => /BUS|TROLLEY|SHARE_TAXI/.test(maneuver)

function ManeuverIcon({ maneuver, size = 18, ...props }) {
  if (maneuver?.startsWith('TRANSIT_') && !ICONS[maneuver]) {
    return isBus(maneuver) ? <Bus size={size} {...props} /> : <TrainFront size={size} {...props} />
  }
  const Icon = ICONS[maneuver] ?? ArrowUp
  return <Icon size={size} {...props} />
}

export default ManeuverIcon

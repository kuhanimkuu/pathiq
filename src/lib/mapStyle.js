// PathIQ's base-map style. Google supplies the streets; this strips out
// Google's own layer of places (shops, hospitals, bus stops, …) and recolours
// the rest in PathIQ's palette, so the map reads as PathIQ and our own layers
// (Hidden Gems, road reports, scored routes) are what stands out.
//
// These are Maps JavaScript API JSON styles, applied in code. They can't be
// combined with a Cloud map ID. If PathIQ later wants vector-only features
// (tilt, heading-up navigation), recreate this style as a Cloud-based map
// style on a map ID instead.

// Shared by both themes: hide Google's place pins and transit stops, keep parks
// as shapes (they help orientation) but without labels.
const DECLUTTER = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
]

// Colours follow the design tokens in src/index.css (--background, --card,
// --secondary, --muted-foreground); CSS variables can't reach the map canvas.
const DARK = [
  { elementType: 'geometry', stylers: [{ color: '#0A1512' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7A8C88' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#050D0B' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1E2D29' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#A9BAB5' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#0C1916' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0E2A21' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1A2724' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0A1512' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#22332F' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2C413C' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#A9BAB5' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#5C6E6A' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#1A2724' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#06212B' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3D5C66' }] },
]

const LIGHT = [
  { elementType: 'geometry', stylers: [{ color: '#F4F7F6' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5F706C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#D5DEDB' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#33423F' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#EEF2F1' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#DCEFE8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#DDE5E2' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#E3ECE9' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#C9D6D2' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#8A9A96' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#CFE3EA' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5B8290' }] },
]

export function mapStyles(theme) {
  return [...(theme === 'light' ? LIGHT : DARK), ...DECLUTTER]
}

export const currentUser = {
  name: 'Wanjiru',
  iqScore: 84,
  tripsThisMonth: 23,
  gemsFound: 6,
}

export const activeRoute = {
  destination: 'Westlands',
  eta: '18 min',
  distance: '9.2 km',
  status: 'Good traffic',
}

export const nearbyIncidents = [
  { id: 1, type: 'Accident', location: 'Uhuru Highway', severity: 'high', reportedAgo: '4 min ago' },
  { id: 2, type: 'Road works', location: 'Waiyaki Way', severity: 'medium', reportedAgo: '22 min ago' },
  { id: 3, type: 'Heavy traffic', location: 'Mombasa Rd', severity: 'low', reportedAgo: '1 hr ago' },
]

export const nearbyGems = [
  { id: 1, name: "Mama Njeri's Nyama Choma", category: 'Food', detour: '0.4 km' },
  { id: 2, name: '24hr fuel + clean washrooms', category: 'Fuel', detour: '0.1 km' },
  { id: 3, name: 'Ngong Hills viewpoint', category: 'Scenic', detour: '2.1 km' },
]

export const allGems = [
  { id: 1, name: "Mama Njeri's Nyama Choma", category: 'Food', detour: '0.4 km', votes: 412 },
  { id: 2, name: '24hr fuel + clean washrooms', category: 'Fuel', detour: '0.1 km', votes: 981 },
  { id: 3, name: 'Ngong Hills viewpoint', category: 'Scenic', detour: '2.1 km', votes: 266 },
  { id: 4, name: 'Java House — quiet corner for calls', category: 'Food', detour: '0.3 km', votes: 154 },
  { id: 5, name: 'Total Energies — 24hr, well-lit', category: 'Fuel', detour: '0.6 km', votes: 340 },
  { id: 6, name: 'Karura Forest gate viewpoint', category: 'Scenic', detour: '1.8 km', votes: 512 },
  { id: 7, name: 'Public washrooms — Yaya Centre', category: 'Facilities', detour: '0.2 km', votes: 88 },
  { id: 8, name: 'Nairobi National Museum', category: 'Attractions', detour: '1.2 km', votes: 305 },
  { id: 9, name: 'Giraffe Centre', category: 'Attractions', detour: '3.4 km', votes: 623 },
  { id: 10, name: 'Trademark Hotel — Village Market', category: 'Hotels', detour: '0.8 km', votes: 197 },
  { id: 11, name: 'Karen Country Lodge', category: 'Hotels', detour: '1.5 km', votes: 143 },
]

export const gemCategories = ['All', 'Attractions', 'Hotels', 'Food', 'Fuel', 'Scenic', 'Facilities']

export const routeOptions = [
  {
    id: 'recommended',
    tag: 'Recommended',
    time: '2h 12m',
    distance: '156 km',
    roadQuality: 92,
    traffic: 78,
    incidents: 96,
  },
  {
    id: 'fastest',
    tag: 'Fastest',
    time: '2h 03m',
    distance: '148 km',
    roadQuality: 64,
    traffic: 71,
    incidents: 58,
  },
  {
    id: 'best-road',
    tag: 'Best Road',
    time: '2h 34m',
    distance: '162 km',
    roadQuality: 98,
    traffic: 60,
    incidents: 90,
  },
]
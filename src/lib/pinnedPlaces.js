import { supabase } from './supabase'

// Places a driver pins on the map (see the pinned_places migration): private
// to them, Home and Work first. Choosing a new Home or Work demotes the old
// one server-side.

export const PIN_LABELS = [
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'other', label: 'Other' },
]

export async function fetchPinnedPlaces() {
  const { data, error } = await supabase.rpc('my_pinned_places')
  if (error) throw error
  return data ?? []
}

export async function pinPlace({ name, label = 'other', lat, lng }) {
  const { data, error } = await supabase
    .from('pinned_places')
    .insert({ name: name.trim(), label, location: `SRID=4326;POINT(${lng} ${lat})` })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updatePinnedPlace(id, { name, label }) {
  const { error } = await supabase.from('pinned_places').update({ name: name.trim(), label }).eq('id', id)
  if (error) throw error
}

export async function unpinPlace(id) {
  const { error } = await supabase.from('pinned_places').delete().eq('id', id)
  if (error) throw error
}

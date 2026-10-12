import { supabase } from './supabase'

// The company pages' data (migration 20261014000000_blog_and_contact.sql):
// the blog, written by admins, and the contact form's inbox. Row-level
// security does the gatekeeping: visitors only ever see published posts, and
// only admins can write posts or read messages.

export const BLOG_PAGE_SIZE = 12
const LIST_FIELDS = 'id, slug, title, excerpt, cover_path, author_name, status, published_at, updated_at'

const check = ({ data, error, count }) => {
  if (error) throw error
  return count == null ? data : { rows: data ?? [], total: count }
}

export const blogImageUrl = (path) =>
  path ? supabase.storage.from('blog-images').getPublicUrl(path).data.publicUrl : null

// About 200 words a minute, never under one.
export const readingMinutes = (body) => Math.max(1, Math.round((body ?? '').split(/\s+/).filter(Boolean).length / 200))

export const formatPostDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

// "Road speeds, explained!" → "road-speeds-explained"
export const slugify = (text) =>
  (text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')

// ── Public ──
export async function fetchPublishedPosts({ page = 0 } = {}) {
  return check(
    await supabase
      .from('blog_posts')
      .select(LIST_FIELDS, { count: 'exact' })
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .range(page * BLOG_PAGE_SIZE, page * BLOG_PAGE_SIZE + BLOG_PAGE_SIZE - 1),
  )
}

// A published post by its slug (or, for an admin previewing, a draft).
export async function fetchPost(slug) {
  return check(await supabase.from('blog_posts').select('*').eq('slug', slug).maybeSingle())
}

export async function submitContactMessage({ name, email, topic, message }) {
  const { error } = await supabase.rpc('submit_contact_message', {
    p_name: name,
    p_email: email,
    p_topic: topic,
    p_message: message,
  })
  if (error) throw error
}

export const CONTACT_TOPICS = [
  { value: 'general', label: 'General question' },
  { value: 'support', label: 'Help with the app' },
  { value: 'partnerships', label: 'Partnerships and data' },
  { value: 'press', label: 'Press and media' },
  { value: 'careers', label: 'Working at PathIQ' },
  { value: 'privacy', label: 'Privacy and my data' },
]
export const topicLabel = (value) => CONTACT_TOPICS.find((t) => t.value === value)?.label ?? value

// ── Admin: blog ──
export const ADMIN_PAGE_SIZE = 50

export async function fetchAllPosts({ status = null, page = 0 } = {}) {
  let q = supabase.from('blog_posts').select(LIST_FIELDS + ', created_at', { count: 'exact' })
  if (status) q = q.eq('status', status)
  return check(
    await q
      .order('updated_at', { ascending: false })
      .range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1),
  )
}

export async function fetchPostById(id) {
  return check(await supabase.from('blog_posts').select('*').eq('id', id).single())
}

// Creates when there's no id. Returns the saved row.
export async function savePost({ id, ...fields }) {
  const q = id
    ? supabase.from('blog_posts').update(fields).eq('id', id)
    : supabase.from('blog_posts').insert(fields)
  const { data, error } = await q.select('*').single()
  if (error) {
    if (error.code === '23505') throw new Error('Another post already uses that web address. Change the slug.')
    throw error
  }
  return data
}

export async function deletePost(id) {
  const { error } = await supabase.from('blog_posts').delete().eq('id', id)
  if (error) throw error
}

// Uploads to blog-images/<year>/<random>.<ext>; returns the object path.
export async function uploadBlogImage(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('blog-images').upload(path, file, { contentType: file.type })
  if (error) throw error
  return path
}

// ── Admin: messages ──
export async function fetchMessages({ status = null, page = 0 } = {}) {
  let q = supabase.from('contact_messages').select('*', { count: 'exact' })
  if (status) q = q.eq('status', status)
  return check(
    await q
      .order('created_at', { ascending: false })
      .range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1),
  )
}

export async function countNewMessages() {
  const { count, error } = await supabase
    .from('contact_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new')
  if (error) throw error
  return count ?? 0
}

export async function setMessageStatus(id, status) {
  const { error } = await supabase
    .from('contact_messages')
    .update({ status, handled_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

export async function deleteMessage(id) {
  const { error } = await supabase.from('contact_messages').delete().eq('id', id)
  if (error) throw error
}

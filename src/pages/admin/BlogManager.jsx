import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import {
  ADMIN_PAGE_SIZE,
  blogImageUrl,
  deletePost,
  fetchAllPosts,
  fetchPostById,
  formatPostDate,
  readingMinutes,
  savePost,
  slugify,
  uploadBlogImage,
} from '../../lib/company'
import { Segmented } from './AdminUi'
import { formatDate } from './adminUtils'

// The Markdown renderer is sizeable; it loads only where a post is shown.
const Markdown = lazy(() => import('../../components/Markdown'))

const FILTERS = [
  { value: null, label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Drafts' },
]

const isScheduled = (p) => p.status === 'published' && p.published_at && new Date(p.published_at) > new Date()

function PostStatus({ post }) {
  if (post.status === 'draft') return <span className="admin-pill status-pending">Draft</span>
  if (isScheduled(post)) return <span className="admin-pill status-pending">Scheduled</span>
  return <span className="admin-pill status-verified">Published</span>
}

// <input type="datetime-local"> works in local time; the database in UTC.
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)

// ── List: /app/admin/blog ──
export function BlogList() {
  const [status, setStatus] = useState(null)
  const [page, setPage] = useState(0)
  const [data, setData] = useState({ key: null, rows: [], total: 0, error: '' })
  const key = `${status}:${page}`
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    fetchAllPosts({ status, page })
      .then(({ rows, total }) => !cancelled && setData({ key, rows, total, error: '' }))
      .catch((err) => !cancelled && setData({ key, rows: [], total: 0, error: err.message }))
    return () => {
      cancelled = true
    }
  }, [status, page, key])

  const pages = Math.ceil(data.total / ADMIN_PAGE_SIZE)
  return (
    <div>
      <div className="admin-title-row">
        <h1 className="page-title">Blog</h1>
        <Link to="/app/admin/blog/new" className="admin-btn primary">
          <Plus size={16} /> New post
        </Link>
      </div>
      <div className="admin-toolbar">
        <Segmented
          label="Status"
          options={FILTERS}
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(0)
          }}
        />
        <Link to="/blog" target="_blank" className="admin-btn small">
          <ExternalLink size={14} /> View the blog
        </Link>
      </div>

      {data.error && <p className="auth-error">{data.error}</p>}
      {data.key !== key ? (
        <p className="list-row-sub">Loading…</p>
      ) : data.rows.length === 0 ? (
        <div className="admin-empty">
          {status ? 'No posts match.' : 'No posts yet. Write the first one: it stays a draft until you publish it.'}
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table clickable">
            <thead>
              <tr>
                <th>Post</th>
                <th>Status</th>
                <th className="hide-sm">Published</th>
                <th className="hide-sm">Last edited</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/app/admin/blog/${p.id}`)}>
                  <td>
                    <Link to={`/app/admin/blog/${p.id}`} className="admin-row-btn" onClick={(e) => e.stopPropagation()}>
                      <span>
                        <span className="admin-queue-title">{p.title}</span>
                        <span className="admin-queue-sub">/blog/{p.slug}</span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <PostStatus post={p} />
                  </td>
                  <td className="hide-sm">{p.published_at ? formatPostDate(p.published_at) : '–'}</td>
                  <td className="hide-sm">{formatDate(p.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="admin-pager">
          <button className="admin-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page + 1} of {pages} · {data.total} posts
          </span>
          <button className="admin-btn" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// ── Editor: /app/admin/blog/new and /app/admin/blog/:id ──
export function BlogEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  // A post just created arrives with the navigation, so it isn't fetched again.
  const handedOver = useLocation().state?.post
  const [loaded, setLoaded] = useState({ id: null, post: null, error: '' })
  const current = isNew
    ? { id, post: null, error: '' }
    : handedOver?.id === id
      ? { id, post: handedOver, error: '' }
      : loaded

  useEffect(() => {
    if (isNew || handedOver?.id === id || loaded.id === id) return
    let cancelled = false
    fetchPostById(id)
      .then((post) => !cancelled && setLoaded({ id, post, error: '' }))
      .catch((err) => !cancelled && setLoaded({ id, post: null, error: err.message }))
    return () => {
      cancelled = true
    }
    // Only when the post changes, not when its own load finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew])

  const back = (
    <Link to="/app/admin/blog" className="admin-back">
      <ArrowLeft size={15} /> Blog
    </Link>
  )
  if (current.id !== id) return <div>{back}<p className="list-row-sub">Loading…</p></div>
  if (current.error) return <div>{back}<p className="auth-error">{current.error}</p></div>
  // Keyed so opening another post (or the one just created) starts fresh.
  return <PostForm key={current.post?.id ?? 'new'} initial={current.post} back={back} />
}

function PostForm({ initial, back }) {
  const handedNotice = useLocation().state?.notice
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [post, setPost] = useState(initial)
  const [blank] = useState(() => ({
    title: '',
    slug: '',
    excerpt: '',
    author_name: profile?.display_name ?? profile?.username ?? '',
    published_at: '',
    cover_path: null,
    body: '',
  }))
  const [form, setForm] = useState(() => ({
    title: initial?.title ?? '',
    slug: initial?.slug ?? '',
    excerpt: initial?.excerpt ?? '',
    author_name: initial?.author_name ?? profile?.display_name ?? profile?.username ?? '',
    published_at: toLocalInput(initial?.published_at),
    cover_path: initial?.cover_path ?? null,
    body: initial?.body ?? '',
  }))
  // The slug follows the title until someone edits it (or the post is saved).
  const [slugTouched, setSlugTouched] = useState(Boolean(initial))
  const [view, setView] = useState('write')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(handedNotice ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const bodyRef = useRef(null)

  // What the form is compared with for "unsaved changes".
  const saved = !post ? blank : {
    title: post?.title ?? '',
    slug: post?.slug ?? '',
    excerpt: post?.excerpt ?? '',
    author_name: post?.author_name ?? '',
    published_at: toLocalInput(post?.published_at),
    cover_path: post?.cover_path ?? null,
    body: post?.body ?? '',
  }
  const dirty = Object.keys(form).some((k) => (form[k] ?? '') !== (saved[k] ?? ''))

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (e) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = (key) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [key]: value, ...(key === 'title' && !slugTouched ? { slug: slugify(value) } : {}) }))
  }

  async function save(status) {
    setError('')
    setNotice('')
    const slug = slugify(form.slug || form.title)
    if (!form.title.trim()) return setError('Give the post a title.')
    if (!slug) return setError('The web address needs at least one letter or number.')
    if (status === 'published' && !form.body.trim()) return setError('Write something before publishing.')
    setBusy(status)
    try {
      const row = await savePost({
        id: post?.id,
        title: form.title.trim(),
        slug,
        excerpt: form.excerpt.trim() || null,
        author_name: form.author_name.trim() || null,
        published_at: fromLocalInput(form.published_at),
        cover_path: form.cover_path,
        body: form.body,
        status,
      })
      setPost(row)
      setSlugTouched(true)
      setForm((f) => ({ ...f, slug: row.slug, published_at: toLocalInput(row.published_at) }))
      const message =
        status === 'draft'
          ? post?.status === 'published'
            ? 'Unpublished. It’s a draft again.'
            : 'Draft saved.'
          : isScheduled(row)
            ? `Scheduled for ${formatDate(row.published_at)}.`
            : 'Published.'
      setNotice(message)
      if (!post) navigate(`/app/admin/blog/${row.id}`, { replace: true, state: { post: row, notice: message } })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function upload(file, onDone) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return setError('Images must be 5 MB or smaller.')
    setError('')
    setBusy('upload')
    try {
      onDone(await uploadBlogImage(file))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  // Puts ![alt](url) where the cursor is in the body.
  function insertImage(path) {
    const el = bodyRef.current
    const at = el ? el.selectionStart : form.body.length
    const snippet = `\n\n![Describe the image](${blogImageUrl(path)})\n\n`
    setForm((f) => ({ ...f, body: f.body.slice(0, at) + snippet + f.body.slice(at) }))
    setView('write')
  }

  async function remove() {
    setBusy('delete')
    try {
      await deletePost(post.id)
      navigate('/app/admin/blog', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy('')
      setConfirmDelete(false)
    }
  }

  const published = post?.status === 'published'
  const cover = blogImageUrl(form.cover_path)
  return (
    <div className="blog-editor">
      {back}
      <div className="admin-title-row">
        <h1 className="page-title">
          {post ? 'Edit post' : 'New post'} {post && <PostStatus post={post} />}
        </h1>
        <div className="admin-title-actions">
          {post && (
            <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="admin-btn">
              <ExternalLink size={15} /> {published && !isScheduled(post) ? 'View' : 'Preview'}
            </a>
          )}
          <button type="button" className="admin-btn" disabled={!!busy} onClick={() => save('draft')}>
            {busy === 'draft' ? 'Saving…' : published ? 'Unpublish' : 'Save draft'}
          </button>
          <button type="button" className="admin-btn primary" disabled={!!busy} onClick={() => save('published')}>
            {busy === 'published' ? 'Publishing…' : published ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}
      {notice && !dirty && <p className="admin-notice">{notice}</p>}
      {dirty && post && <p className="admin-hint">Unsaved changes.</p>}

      <div className="blog-editor-grid">
        <div className="blog-editor-main">
          <label className="admin-field">
            <span>Title</span>
            <input className="form-input blog-title-input" maxLength={160} value={form.title} onChange={set('title')} placeholder="What's the post about?" />
          </label>
          <div className="admin-field">
            <span>Body (Markdown)</span>
            <div className="blog-body-bar">
              <Segmented
                label="Body view"
                options={[
                  { value: 'write', label: 'Write' },
                  { value: 'preview', label: 'Preview' },
                ]}
                value={view}
                onChange={setView}
              />
              <label className={'admin-btn small admin-file-btn' + (busy ? ' disabled' : '')}>
                <ImagePlus size={14} /> {busy === 'upload' ? 'Uploading…' : 'Insert image'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  disabled={!!busy}
                  onChange={(e) => {
                    upload(e.target.files[0], insertImage)
                    e.target.value = ''
                  }}
                />
              </label>
              <span className="admin-hint">
                {readingMinutes(form.body)} min read · {form.body.length.toLocaleString()} / 100,000
              </span>
            </div>
            {view === 'write' ? (
              <textarea
                ref={bodyRef}
                className="form-textarea blog-body-input"
                maxLength={100000}
                value={form.body}
                onChange={set('body')}
                placeholder={'Write in Markdown:\n\n## A heading\n\nA paragraph with **bold**, *italics* and a [link](https://example.com).\n\n- a list\n- of things\n\n> A quote'}
              />
            ) : (
              <div className="blog-preview">
                {form.body.trim() ? (
                  <Suspense fallback={<p className="list-row-sub">Loading preview…</p>}>
                    <Markdown>{form.body}</Markdown>
                  </Suspense>
                ) : (
                  <p className="list-row-sub">Nothing to preview yet.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="blog-editor-side">
          <label className="admin-field">
            <span>Web address</span>
            <div className="blog-slug">
              <span>/blog/</span>
              <input
                className="form-input"
                maxLength={80}
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true)
                  setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))
                }}
                onBlur={() => setForm((f) => ({ ...f, slug: slugify(f.slug) }))}
              />
            </div>
            {published && form.slug !== saved.slug && (
              <small className="admin-hint">Changing it breaks links people have already shared.</small>
            )}
          </label>
          <label className="admin-field">
            <span>Summary ({form.excerpt.length}/300)</span>
            <textarea
              className="form-textarea"
              rows={3}
              maxLength={300}
              value={form.excerpt}
              onChange={set('excerpt')}
              placeholder="One or two sentences for the blog list and link previews."
            />
          </label>
          <div className="admin-field">
            <span>Cover image</span>
            {cover ? (
              <div className="blog-cover">
                <img src={cover} alt="" />
                <button
                  type="button"
                  className="admin-icon-btn"
                  aria-label="Remove cover image"
                  onClick={() => setForm((f) => ({ ...f, cover_path: null }))}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label className={'admin-btn admin-file-btn' + (busy ? ' disabled' : '')}>
                <ImagePlus size={15} /> {busy === 'upload' ? 'Uploading…' : 'Upload cover'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  disabled={!!busy}
                  onChange={(e) => {
                    upload(e.target.files[0], (path) => setForm((f) => ({ ...f, cover_path: path })))
                    e.target.value = ''
                  }}
                />
              </label>
            )}
            <small className="admin-hint">Wide images work best (16:9, at least 1600 px across). Up to 5 MB.</small>
          </div>
          <label className="admin-field">
            <span>Author</span>
            <input className="form-input" maxLength={80} value={form.author_name} onChange={set('author_name')} placeholder="Shown on the post" />
          </label>
          <label className="admin-field">
            <span>Publish date</span>
            <input className="form-input" type="datetime-local" value={form.published_at} onChange={set('published_at')} />
            <small className="admin-hint">
              Blank: when you press Publish. A future date schedules the post; it goes live then.
            </small>
          </label>
          {post && (
            <div className="blog-editor-danger">
              {confirmDelete ? (
                <div className="admin-confirm">
                  Delete this post for good?
                  <button type="button" className="admin-btn small danger" disabled={!!busy} onClick={remove}>
                    Delete
                  </button>
                  <button type="button" className="admin-btn small" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" className="admin-btn ghost-danger small" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={14} /> Delete post
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

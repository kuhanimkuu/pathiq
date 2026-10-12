import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { blogImageUrl, fetchPost, formatPostDate, readingMinutes } from '../../../lib/company'
import usePageTitle from './usePageTitle'
import './company.css'

// The Markdown renderer is sizeable; it loads only where a post is shown.
const Markdown = lazy(() => import('../../../components/Markdown'))

// One post. Visitors only ever get published ones (row-level security); an
// admin opening a draft's link sees it with a "draft" banner, as a preview.
export default function BlogPostPage() {
  const { slug } = useParams()
  const [result, setResult] = useState({ slug: null, post: null, error: '' })

  useEffect(() => {
    let cancelled = false
    fetchPost(slug)
      .then((post) => !cancelled && setResult({ slug, post, error: '' }))
      .catch(() => !cancelled && setResult({ slug, post: null, error: 'This post couldn’t be loaded. Please try again.' }))
    return () => {
      cancelled = true
    }
  }, [slug])

  const { post, error } = result
  usePageTitle(post?.title ?? (result.slug === slug ? 'Post not found' : 'Blog'))

  // Search engines and link previews read the description too.
  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]')
    if (!meta || !post?.excerpt) return
    const before = meta.getAttribute('content')
    meta.setAttribute('content', post.excerpt)
    return () => meta.setAttribute('content', before)
  }, [post])

  const back = (
    <Link to="/blog" className="post-back">
      <ArrowLeft size={16} /> All posts
    </Link>
  )

  if (result.slug !== slug) {
    return <section className="section post"><p>Loading…</p></section>
  }
  if (error || !post) {
    return (
      <section className="section post">
        {back}
        <h1>{error ? 'Something went wrong' : 'Post not found'}</h1>
        <p>{error || 'This post doesn’t exist or isn’t published yet.'}</p>
      </section>
    )
  }

  const cover = blogImageUrl(post.cover_path)
  const isLive = post.status === 'published' && post.published_at && new Date(post.published_at) <= new Date()
  return (
    <article className="section post">
      {back}
      {!isLive && (
        <p className="post-draft" style={{ marginTop: 18 }}>
          Preview: this post isn&apos;t public yet{post.status === 'published' ? ` (goes live ${formatPostDate(post.published_at)})` : ' (draft)'}.
        </p>
      )}
      <h1>{post.title}</h1>
      {post.excerpt && <p className="post-excerpt">{post.excerpt}</p>}
      <div className="post-meta">
        {post.author_name && <span>{post.author_name}</span>}
        {post.published_at && <span>{formatPostDate(post.published_at)}</span>}
        <span>{readingMinutes(post.body)} min read</span>
      </div>
      {cover && <img src={cover} alt="" className="post-cover" />}
      <Suspense fallback={<p>Loading…</p>}>
        <Markdown>{post.body}</Markdown>
      </Suspense>
      <div className="post-footer">
        <div className="company-cta">
          <div>
            <h2>See it on the road</h2>
            <p>Routes scored on real road conditions, and the Hidden Gems along the way.</p>
          </div>
          <div className="hero-ctas">
            <Link to="/app" className="btn btn-primary">Open the map</Link>
            <Link to="/blog" className="btn btn-outline">More posts</Link>
          </div>
        </div>
      </div>
    </article>
  )
}

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Newspaper } from 'lucide-react'
import { BLOG_PAGE_SIZE, blogImageUrl, fetchPublishedPosts, formatPostDate } from '../../../lib/company'
import usePageTitle from './usePageTitle'
import './company.css'

function PostCard({ post, featured = false }) {
  const cover = blogImageUrl(post.cover_path)
  const Heading = featured ? 'h2' : 'h3'
  return (
    <Link to={`/blog/${post.slug}`} className={'blog-card' + (featured ? ' featured' : '')}>
      <div className={'blog-card-cover' + (cover ? '' : ' placeholder')}>
        {cover ? <img src={cover} alt="" loading="lazy" /> : <Newspaper size={34} strokeWidth={1.5} />}
      </div>
      <div className="blog-card-body">
        <span className="blog-card-date">
          {formatPostDate(post.published_at)}
          {post.author_name && ` · ${post.author_name}`}
        </span>
        <Heading>{post.title}</Heading>
        {post.excerpt && <p>{post.excerpt}</p>}
        <span className="blog-card-more">Read more →</span>
      </div>
    </Link>
  )
}

export default function BlogPage() {
  usePageTitle('Blog')
  const [params, setParams] = useSearchParams()
  const page = Math.max(0, Number(params.get('page')) || 0)
  const [result, setResult] = useState({ page: -1, rows: [], total: 0, error: '' })

  useEffect(() => {
    let cancelled = false
    fetchPublishedPosts({ page })
      .then(({ rows, total }) => !cancelled && setResult({ page, rows, total, error: '' }))
      .catch(() => !cancelled && setResult({ page, rows: [], total: 0, error: 'The blog couldn’t be loaded. Please try again.' }))
    return () => {
      cancelled = true
    }
  }, [page])

  const loading = result.page !== page
  const pages = Math.ceil(result.total / BLOG_PAGE_SIZE)
  const goTo = (p) => {
    setParams(p > 0 ? { page: String(p) } : {})
    window.scrollTo({ top: 0 })
  }

  return (
    <>
      <section className="section company-hero">
        <div className="pill pill-green">Blog</div>
        <h1>News from the road</h1>
        <p className="lede">Product updates, what we&apos;re learning about roads, and stories from our Scouts.</p>
      </section>

      <section className="section company-section">
        {loading ? (
          <p>Loading posts…</p>
        ) : result.error ? (
          <p className="contact-error">{result.error}</p>
        ) : result.rows.length === 0 ? (
          <div className="company-empty">
            <h3>No posts yet</h3>
            <p>The first posts are on their way. In the meantime, the map is open.</p>
            <Link to="/app" className="btn btn-primary">Open the map</Link>
          </div>
        ) : (
          <>
            <div className="blog-grid">
              {result.rows.map((post, i) => (
                <PostCard key={post.id} post={post} featured={page === 0 && i === 0} />
              ))}
            </div>
            {pages > 1 && (
              <div className="blog-pager">
                <button type="button" className="btn btn-outline" disabled={page === 0} onClick={() => goTo(page - 1)}>
                  ← Newer posts
                </button>
                <button type="button" className="btn btn-outline" disabled={page + 1 >= pages} onClick={() => goTo(page + 1)}>
                  Older posts →
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  )
}

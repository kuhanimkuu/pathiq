import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './Markdown.css'

// Blog post bodies: Markdown, with GitHub's extras (tables, strikethrough,
// bare links). Raw HTML in the text is never rendered as HTML,
// and react-markdown drops javascript: and other unsafe links.
const components = {
  a: ({ href = '', children }) => {
    const external = /^https?:\/\//.test(href)
    return (
      <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    )
  },
  img: ({ src, alt }) => <img src={src} alt={alt ?? ''} loading="lazy" />,
}

function Markdown({ children, className = '' }) {
  return (
    <div className={'prose ' + className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children ?? ''}</ReactMarkdown>
    </div>
  )
}

export default Markdown

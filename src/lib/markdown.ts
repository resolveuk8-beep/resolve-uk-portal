import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { slugify } from './format'

export interface Heading {
  id: string
  text: string
}

export interface Rendered {
  html: string
  headings: Heading[]
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Turns Markdown into safe HTML. Mermaid fences become <pre class="mermaid"> for the diagram step in
// Markdown.tsx, second-level headings get ids for the contents list, tables get a scrolling wrapper,
// and an italic paragraph that starts with "Figure" becomes a caption.
export function renderMarkdown(source: string): Rendered {
  const headings: Heading[] = []
  const used = new Set<string>()
  const md = new Marked({ gfm: true })

  md.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens)
        if (depth !== 2) return `<h${depth}>${inner}</h${depth}>\n`
        let id = slugify(text) || 'section'
        for (let n = 2; used.has(id); n++) id = `${slugify(text) || 'section'}-${n}`
        used.add(id)
        headings.push({ id, text })
        return `<h2 id="${id}">${inner}</h2>\n`
      },
      code({ text, lang }) {
        if ((lang ?? '').trim() === 'mermaid') return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`
        return false
      },
    },
  })

  const raw = (md.parse(source, { async: false }) as string)
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<p><em>(Figure \d)/g, '<p class="figcaption"><em>$1')

  return { html: DOMPurify.sanitize(raw, { ADD_ATTR: ['style'] }), headings }
}

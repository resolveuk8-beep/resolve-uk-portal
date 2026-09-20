import { useEffect, useMemo, useRef } from 'react'
import { renderMarkdown, type Heading } from '../lib/markdown'
import { useTheme, type Theme } from '../lib/theme'

const palettes: Record<Theme, Record<string, string>> = {
  light: {
    background: '#ffffff',
    primaryColor: '#e4efe8',
    primaryTextColor: '#1d221f',
    primaryBorderColor: '#155b34',
    lineColor: '#5f6862',
    secondaryColor: '#f0f2ec',
    tertiaryColor: '#fafaf7',
    clusterBkg: '#f7f8f4',
    clusterBorder: '#d9dad1',
    edgeLabelBackground: '#ffffff',
    noteBkgColor: '#f8efd9',
    noteTextColor: '#1d221f',
  },
  dark: {
    background: '#1a1d1b',
    primaryColor: '#1c2b22',
    primaryTextColor: '#e9ece9',
    primaryBorderColor: '#5cc08a',
    lineColor: '#9aa39c',
    secondaryColor: '#1e2220',
    tertiaryColor: '#151716',
    clusterBkg: '#1a1d1b',
    clusterBorder: '#343937',
    edgeLabelBackground: '#1a1d1b',
    noteBkgColor: '#2b2416',
    noteTextColor: '#e9ece9',
  },
}

let counter = 0

async function drawDiagrams(root: HTMLElement, theme: Theme, cancelled: () => boolean) {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('pre.mermaid'))
  if (nodes.length === 0) return
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: { ...palettes[theme], fontFamily: "'Archivo', system-ui, sans-serif", fontSize: '15px' },
    flowchart: { htmlLabels: true, curve: 'basis' },
  })
  for (const node of nodes) {
    if (cancelled()) return
    node.dataset.src ??= node.textContent ?? ''
    try {
      const { svg } = await mermaid.render(`diagram-${++counter}`, node.dataset.src)
      if (cancelled()) return
      node.innerHTML = svg
      node.setAttribute('data-processed', 'true')
      const drawn = node.querySelector('svg')
      if (drawn) {
        drawn.style.minWidth = '620px'
        drawn.style.maxWidth = 'none'
        drawn.style.height = 'auto'
      }
    } catch {
      node.textContent = 'This diagram could not be drawn.'
    }
  }
}

interface Props {
  source: string
  onHeadings?: (headings: Heading[]) => void
}

export function Markdown({ source, onHeadings }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useTheme()
  const { html, headings } = useMemo(() => renderMarkdown(source), [source])

  useEffect(() => {
    onHeadings?.(headings)
  }, [headings, onHeadings])

  useEffect(() => {
    const root = ref.current
    if (!root) return
    let stop = false
    // put the sources back so a theme change redraws from the text, not from the old drawing
    root.querySelectorAll<HTMLElement>('pre.mermaid[data-src]').forEach((n) => {
      n.textContent = n.dataset.src ?? ''
      n.removeAttribute('data-processed')
    })
    void drawDiagrams(root, theme, () => stop)
    return () => {
      stop = true
    }
  }, [html, theme])

  return <div ref={ref} className="prose" dangerouslySetInnerHTML={{ __html: html }} />
}

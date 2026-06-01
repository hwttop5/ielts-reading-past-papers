import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.use({
  gfm: true,
  breaks: true
})

/** Open markdown links in a new tab after sanitization (safe attributes only). */
function externalizeLinks(html: string): string {
  return html.replace(/<a\s+/g, '<a target="_blank" rel="noopener noreferrer" ')
}

function sanitizeHtml(source: string): string {
  const s = source?.trim() ?? ''
  if (!s) return ''
  const clean = DOMPurify.sanitize(s)
  return externalizeLinks(clean)
}

/**
 * Render assistant markdown to sanitized HTML for `v-html`.
 * Strips scripts/on* handlers; keeps common typography (lists, code, tables, links).
 */
export function renderAssistantMarkdown(source: string): string {
  const s = source?.trim() ?? ''
  if (!s) return ''
  const raw = marked(s, { async: false }) as string
  const clean = DOMPurify.sanitize(raw)
  return externalizeLinks(clean)
}

export function renderAssistantHtml(source: string): string {
  return sanitizeHtml(source)
}

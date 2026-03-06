export const TYPE_COLORS: { [key: string]: string } = {
  button: '#3b82f6', card: '#22c55e', link: '#06b6d4', 'link-arrow': '#06b6d4',
  input: '#f59e0b', badge: '#ec4899', heading: '#7c5cfc', text: '#63636e',
  'icon-container': '#f59e0b', icon: '#f59e0b', 'section-header': '#22c55e',
  navigation: '#ef4444', layout: '#7c5cfc',
};

export function typeColor(t: string) { return TYPE_COLORS[t] || '#63636e'; }

export const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
}

export function formatHtml(html: string) {
  if (!html) return "";
  let indent = 0
  return html
    .replace(/></g, ">\n<")
    .split("\n")
    .map((line) => {
      let l = line.trim()
      if (l.startsWith("</")) indent = Math.max(indent - 1, 0)
      const result = "  ".repeat(indent) + l
      if (l.startsWith("<") && !l.startsWith("</") && !l.endsWith("/>") && !l.includes("</")) indent++
      return result
    })
    .join("\n")
}

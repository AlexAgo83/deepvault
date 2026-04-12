export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain'): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return
  }

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noreferrer'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

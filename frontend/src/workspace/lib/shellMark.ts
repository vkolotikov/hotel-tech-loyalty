/**
 * Marks <html> as a workspace while it is mounted (`data-shell="<name>"`,
 * e.g. `appointments`), the way the full admin's Layout marks it `admin`.
 * index.css leaves a workspace's mark out of the Branding "mood"
 * typography, whose (0,3,0) rules on .text-lg … .text-7xl would otherwise
 * replace the workspace's own faces, weights and italics. Returns the
 * cleanup, which puts back whatever mark was there before (or none).
 */
export function markShell(root: HTMLElement, name: string): () => void {
  const before = root.getAttribute('data-shell')
  root.setAttribute('data-shell', name)
  return () => {
    if (before === null) root.removeAttribute('data-shell')
    else root.setAttribute('data-shell', before)
  }
}

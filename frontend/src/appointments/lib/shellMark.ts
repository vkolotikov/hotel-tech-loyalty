/**
 * Marks <html> as the Appointments workspace while it is mounted
 * (`data-shell="appointments"`), the way the full admin's Layout marks it
 * `admin`. index.css leaves this mark out of the Branding "mood" typography,
 * whose (0,3,0) rules on .text-lg … .text-7xl would otherwise replace the
 * workspace's own faces, weights and italics. Returns the cleanup, which puts
 * back whatever mark was there before (or none).
 */
export function markShell(root: HTMLElement): () => void {
  const before = root.getAttribute('data-shell')
  root.setAttribute('data-shell', 'appointments')
  return () => {
    if (before === null) root.removeAttribute('data-shell')
    else root.setAttribute('data-shell', before)
  }
}

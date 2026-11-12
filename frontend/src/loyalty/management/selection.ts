/** Bring the selected record into view when the catalogue and detail are stacked. */
export function focusManagementSelection() {
  if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1100px)').matches) requestAnimationFrame(() => {
    const detail = document.getElementById('management-detail')
    detail?.focus({ preventScroll: true })
    detail?.scrollIntoView({ block: 'start', behavior: 'auto' })
  })
}

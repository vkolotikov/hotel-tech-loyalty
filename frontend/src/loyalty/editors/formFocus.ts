/** React applies manual validation after submit; reveal the first problem on the next painted frame. */
export function focusEditorProblem(form: HTMLFormElement) {
  requestAnimationFrame(() => {
    if (!form.isConnected) return
    const control = form.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (!control) return
    const disclosure = control.closest('details')
    if (disclosure) disclosure.open = true
    control.focus({ preventScroll: true })
    control.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}

/** Where a dragged card would land, and — in the danger colour — why it will not do. Pointer-only, so hidden from screen readers. */
export function DragPreview({ top, height, label, why }: { top: number; height: number; label: string; why: string | null }) {
  return (
    <div aria-hidden data-drag-preview=""
      className={`pointer-events-none absolute inset-x-1 z-30 overflow-hidden rounded-md border-2 border-dashed bg-a-surface px-2 py-1 text-xs font-semibold ${why ? 'border-a-danger text-a-danger' : 'border-a-accent text-a-accent-deep'}`}
      style={{ top, height }}>
      <div className="truncate">{label}</div>
      {why && <div className="font-normal">{why}</div>}
    </div>
  )
}

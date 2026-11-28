import type { ReactNode } from 'react'
import type { BuddyKind, Mood } from './buddyLogic'

/**
 * A buddy (2026-11-28, the owner: "add some animated characters"): one of four characters of our own drawing — Hexi
 * the hexagon in the organisation's colour, Pip the sprout, Miu the cat and Ember the flame — on one rig: a body, two
 * arms, two feet and a face whose eyes and mouth follow the mood (asleep, ready, busy, proud, a party). The week's
 * leader wears a crown. Everything that moves is theme/time.css's `time-buddy-*` (the frame stops it for a device that
 * asked for less motion, and each rests in its pose). Decoration only: what a mood means is said in words beside it.
 */

/** What stands behind the body: an antenna, a sprout, ears and a tail. A crown takes the place of what sits on top. */
function back(kind: BuddyKind, crown: boolean): ReactNode {
  if (kind === 'hexi') {
    return crown ? null : (
      <g className="time-buddy-sway">
        <line className="time-buddy-stalk" x1="60" y1="28" x2="60" y2="13" />
        <circle className="time-buddy-bulb" cx="60" cy="10.5" r="5" />
      </g>
    )
  }
  if (kind === 'pip') {
    return crown ? null : (
      <g className="time-buddy-sway">
        <path className="time-buddy-stalk" d="M60 28 q-1.5 -8 1.5 -15" />
        <path className="time-buddy-leaf" d="M61.5 13.5 q10 -10 19 -3.5 q-7.5 10 -19 3.5z" />
        <path className="time-buddy-leaf" d="M60.5 17 q-8.5 -7.5 -15.5 -1.5 q6.5 7.5 15.5 1.5z" />
      </g>
    )
  }
  if (kind === 'miu') {
    return (
      <>
        <path className="time-buddy-limb time-buddy-tail" d="M90 90 q17 0 15 -19" />
        <polygon className="time-buddy-skin time-buddy-chunky-sm" points="34,43 37,20 55,34" />
        <polygon className="time-buddy-skin time-buddy-chunky-sm" points="86,43 83,20 65,34" />
        <polygon className="time-buddy-inner" points="39,38 40.5,27 49,33.5" />
        <polygon className="time-buddy-inner" points="81,38 79.5,27 71,33.5" />
      </>
    )
  }
  return null
}

function body(kind: BuddyKind): ReactNode {
  if (kind === 'hexi') return <polygon className="time-buddy-skin time-buddy-chunky" points="60,31 86.8,46.5 86.8,77.5 60,93 33.2,77.5 33.2,46.5" />
  if (kind === 'pip') return <circle className="time-buddy-skin" cx="60" cy="62" r="37.5" />
  if (kind === 'miu') return <rect className="time-buddy-skin" x="25" y="31" width="70" height="67" rx="27" />
  return <path className="time-buddy-skin" d="M63 13 C 61 29 95.5 41 95.5 63 A 35.5 35.5 0 0 1 24.5 63 C 24.5 46 46 37 63 13 Z" />
}

/** What sits on the body: Miu's whiskers and nose, the bright heart of Ember's flame. */
function front(kind: BuddyKind): ReactNode {
  if (kind === 'miu') {
    return (
      <>
        <path className="time-buddy-whisker" d="M33 67 h-9 M34 72 l-8 3 M87 67 h9 M86 72 l8 3" />
        <path className="time-buddy-mouth" d="M57.6 66.5 h4.8 l-2.4 2.8 z" />
      </>
    )
  }
  if (kind === 'ember') return <path className="time-buddy-glow" d="M62 23 C 61 32 73.5 38 72 47 C 66 43.5 58 43.5 53 47 C 52.5 39 59 34 62 23 Z" />
  return null
}

/** How far down a character's face sits (a cat's and a flame's are lower than a hexagon's). */
const FACE_DY: Record<BuddyKind, number> = { hexi: 0, pip: 0, miu: 3, ember: 5 }
const CROWN_DY: Record<BuddyKind, number> = { hexi: 0, pip: -1, miu: 6, ember: 1 }

function face(mood: Mood): ReactNode {
  const asleep = mood === 'sleepy'
  const joy = mood === 'party'
  return (
    <>
      <circle className="time-buddy-cheek" cx="38.5" cy="68" r="4.6" />
      <circle className="time-buddy-cheek" cx="81.5" cy="68" r="4.6" />
      {asleep && <path className="time-buddy-line" d="M41 58 q6 4.5 12 0 M67 58 q6 4.5 12 0" />}
      {joy && <path className="time-buddy-line" d="M41 59.5 q6 -7.5 12 0 M67 59.5 q6 -7.5 12 0" />}
      {!asleep && !joy && (
        <g className="time-buddy-eyes">
          <ellipse className="time-buddy-eye" cx="47" cy="57" rx="7" ry="8" />
          <ellipse className="time-buddy-eye" cx="73" cy="57" rx="7" ry="8" />
          <circle className="time-buddy-pupil" cx="48.5" cy="58" r="3.7" />
          <circle className="time-buddy-pupil" cx="71.5" cy="58" r="3.7" />
          <circle className="time-buddy-glint" cx="49.9" cy="56.4" r="1.25" />
          <circle className="time-buddy-glint" cx="72.9" cy="56.4" r="1.25" />
        </g>
      )}
      {asleep && <ellipse className="time-buddy-mouth" cx="60" cy="74" rx="2.8" ry="3.3" />}
      {mood === 'ready' && <path className="time-buddy-line" d="M53.5 71 q6.5 5.5 13 0" />}
      {mood === 'busy' && <path className="time-buddy-line" d="M52 70.5 q8 8 16 0" />}
      {mood === 'proud' && (
        <>
          <path className="time-buddy-mouth" d="M50.5 69 q9.5 12.5 19 0 z" />
          <ellipse className="time-buddy-tongue" cx="60" cy="75.4" rx="4.2" ry="2.3" />
        </>
      )}
      {joy && (
        <>
          <path className="time-buddy-mouth" d="M48.5 68 q11.5 16.5 23 0 z" />
          <ellipse className="time-buddy-tongue" cx="60" cy="76.6" rx="5.2" ry="2.9" />
        </>
      )}
    </>
  )
}

export function Buddy({ kind, mood = 'ready', size = 64, crown = false, still = false, className = '' }: {
  kind: BuddyKind
  mood?: Mood
  /** The side of its square, in pixels. */
  size?: number
  /** The week's leader's crown. */
  crown?: boolean
  /** Drawn without motion (a row of a list, where many moving at once would be noise). */
  still?: boolean
  className?: string
}) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden focusable="false" data-kind={kind} data-mood={mood}
      data-crown={crown ? 'true' : undefined} data-still={still ? 'true' : undefined} className={`time-buddy shrink-0 ${className}`}>
      <ellipse className="time-buddy-shadow" cx="60" cy="110" rx="27" ry="4.5" />
      <g className="time-buddy-all">
        {back(kind, crown)}
        <line className="time-buddy-limb time-buddy-arm-l" x1="31" y1="68" x2="18" y2="80" />
        <line className="time-buddy-limb time-buddy-arm-r" x1="89" y1="68" x2="102" y2="80" />
        <ellipse className="time-buddy-foot" cx="47" cy="101" rx="8.5" ry="5" />
        <ellipse className="time-buddy-foot" cx="73" cy="101" rx="8.5" ry="5" />
        {body(kind)}
        <ellipse className="time-buddy-shine" cx="45" cy="43" rx="10.5" ry="5.5" transform="rotate(-28 45 43)" />
        {front(kind)}
        <g transform={`translate(0 ${FACE_DY[kind]})`}>{face(mood)}</g>
        {crown && (
          <g transform={`translate(0 ${CROWN_DY[kind]})`}>
            <path className="time-buddy-crown" d="M42 27 l2.5 -15.5 l8 9 l7.5 -12.5 l7.5 12.5 l8 -9 l2.5 15.5 z" />
            <circle className="time-buddy-gem" cx="60" cy="21.5" r="2.2" />
          </g>
        )}
      </g>
      {mood === 'sleepy' && (
        <g className="time-buddy-zzz">
          <path d="M88 35 h7 l-7 8 h7" />
          <path d="M98.5 23 h5.5 l-5.5 6.5 h5.5" />
          <path d="M106 12.5 h4.5 l-4.5 5 h4.5" />
        </g>
      )}
      {mood === 'party' && (
        <g className="time-buddy-sparks">
          <path d="M14 26 l1.9 5.2 l5.2 1.9 l-5.2 1.9 l-1.9 5.2 l-1.9 -5.2 l-5.2 -1.9 l5.2 -1.9 z" />
          <path d="M105 30 l1.6 4.4 l4.4 1.6 l-4.4 1.6 l-1.6 4.4 l-1.6 -4.4 l-4.4 -1.6 l4.4 -1.6 z" />
          <path d="M97 4 l1.2 3.3 l3.3 1.2 l-3.3 1.2 l-1.2 3.3 l-1.2 -3.3 l-3.3 -1.2 l3.3 -1.2 z" />
        </g>
      )}
    </svg>
  )
}

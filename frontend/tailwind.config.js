import colors from 'tailwindcss/colors'
import plugin from 'tailwindcss/plugin'
import {
  COLOURED_TEXT_SHADES, GLASS_SCOPE, GREY_HUES, GREY_TEXT_SHADES, SHIFTED_HUES,
} from './src/theme/glassTokens.ts'
import { glassSolidVariables, glassVariables } from './src/theme/glassVariables.ts'

/*
 * Admin colour tokens read three layers; the first one that is set wins:
 *   1. --style-* (the whole token) or --tc-* (text uses only): set by the
 *      active style's stylesheet block. Only Glass sets them, and only inside
 *      the signed-in admin (GLASS_SCOPE in src/theme/glassTokens.ts).
 *   2. --color-*: the organisation's palette, written inline on <html> by
 *      hooks/useTheme.ts in every style.
 *   3. The literal: today's Classic default.
 * Classic sets no layer-1 variable, so it renders exactly as before.
 */
const triplet = hex => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(' ')
}

/** A palette surface: style value, then palette value, each with its own opacity. */
const surface = (name, fallback) =>
  `rgb(var(--style-${name}, var(--color-${name}, ${fallback})) / calc(var(--alpha-${name}, 1) * <alpha-value>))`

/** A grey screens used to hard-code: its exact value in Classic, a style may replace it. */
const fixed = (name, value) =>
  `rgb(var(--style-${name}, ${value}) / calc(var(--alpha-${name}, 1) * <alpha-value>))`

/** A palette text colour the style can replace outright. */
const text = (name, fallback) =>
  `rgb(var(--style-${name}, var(--color-${name}, ${fallback})) / <alpha-value>)`

/** A colour whose TEXT uses the style can swap, leaving fills alone. */
const textOnly = (name, fallback) => `rgb(var(--tc-${name}, ${fallback}) / <alpha-value>)`

// Royal blue, the default brand (shadeScale('#3b82f6') in src/theme/colour.ts):
// an organisation with no saved palette paints none, so these literals show.
const PRIMARY = {
  50: '235 243 254', 100: '216 230 253', 200: '177 205 251', 300: '128 174 249', 400: '88 149 247',
  500: '59 130 246', 600: '52 114 216', 700: '44 98 185', 800: '38 85 160', 900: '32 72 135',
}
const primaryFill = Object.fromEntries(
  Object.entries(PRIMARY).map(([shade, fallback]) => [shade, `rgb(var(--color-primary-${shade}, ${fallback}) / <alpha-value>)`]),
)
const primaryText = Object.fromEntries(
  Object.entries(PRIMARY).map(([shade, fallback]) => [shade, textOnly(`primary-${shade}`, `var(--color-primary-${shade}, ${fallback})`)]),
)

/** text-red-400 and friends: Tailwind's own value in Classic, a lighter shade in Glass. */
const textScale = (hues, shades) => Object.fromEntries(
  hues.map(hue => [hue, Object.fromEntries(shades.map(shade => [shade, textOnly(`${hue}-${shade}`, triplet(colors[hue][shade]))]))]),
)
const shiftedText = textScale(SHIFTED_HUES, COLOURED_TEXT_SHADES)
const greyText = textScale(GREY_HUES, GREY_TEXT_SHADES)

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Fills (bg-, border-, ring-) keep the brand's own shades in every
        // style; text-primary-* is in textColor below.
        primary: primaryFill,
        dark: {
          bg:       surface('dark-bg', '13 13 13'),
          surface:  surface('dark-surface', '22 22 22'),
          surface2: surface('dark-surface2', '30 30 30'),
          surface3: surface('dark-surface3', '38 38 38'),
          surface4: surface('dark-surface4', '46 46 46'),
          // `card` and `hover` were used by 28 class names across the chatbot
          // and analytics screens but were never defined here, so Tailwind
          // generated nothing for them and those cards rendered with NO
          // background — which is why that part of the product looked like a
          // second, flatter design language rather than a styling choice.
          card:     surface('dark-card', '30 30 30'),
          hover:    surface('dark-hover', '38 38 38'),
          border:   surface('dark-border', '44 44 44'),
          border2:  surface('dark-border2', '56 56 56'),
        },
        // The greys screens used to hard-code, as tokens. They never followed
        // the palette, so Classic keeps each exact value.
        panel:          fixed('panel', '30 30 30'),         // was bg-[#1e1e1e]
        'panel-dim':    fixed('panel-dim', '26 26 26'),     // was bg-[#1a1a1a]
        'panel-raised': fixed('panel-raised', '51 51 51'),  // was bg-[#333]
        well:           fixed('well', '17 17 17'),           // was bg-[#111]
        't-primary':   text('text-primary', '255 255 255'),
        't-secondary': text('text-secondary', '142 142 147'),
        't-soft':      'rgb(var(--style-text-soft, 160 160 160) / <alpha-value>)', // was text-[#a0a0a0]
        // Muted text: was #636366 (3.0:1 on a card), now the t-secondary grey (5.4:1).
        't-muted':     'rgb(var(--style-text-muted, 142 142 147) / <alpha-value>)',
        // Text on a brand fill: ink or white, whichever reads (theme/glass.ts onColor).
        'on-primary':  'rgb(var(--color-on-primary, 3 5 10) / <alpha-value>)',
        accent:        'rgb(var(--color-accent, 50 215 75) / <alpha-value>)',
        error:         'rgb(var(--color-error, 255 55 95) / <alpha-value>)',
        warning:       'rgb(var(--color-warning, 255 214 10) / <alpha-value>)',
        info:          'rgb(var(--color-info, 10 132 255) / <alpha-value>)',
        // The fixed status colours screens used to hard-code ([#32d74b],
        // [#ff375f], [#0a84ff]). Unlike accent/error/info they ignore the
        // palette, so Classic keeps the exact old colours.
        success:       'rgb(50 215 75 / <alpha-value>)',
        danger:        'rgb(255 55 95 / <alpha-value>)',
        notice:        'rgb(10 132 255 / <alpha-value>)',
        // Member portal tokens — see src/portal/theme/portal.css. Only
        // frontend/src/portal uses these; the sweep test forbids the reverse.
        p: {
          bg:            'rgb(var(--p-bg) / <alpha-value>)',
          surface:       'rgb(var(--p-surface) / <alpha-value>)',
          'surface-2':   'rgb(var(--p-surface-2) / <alpha-value>)',
          text:          'rgb(var(--p-text) / <alpha-value>)',
          'text-2':      'rgb(var(--p-text-2) / <alpha-value>)',
          border:        'rgb(var(--p-border) / <alpha-value>)',
          accent:        'rgb(var(--p-accent) / <alpha-value>)',
          'accent-ink':  'rgb(var(--p-accent-ink) / <alpha-value>)',
          'accent-deep': 'rgb(var(--p-accent-deep) / <alpha-value>)',
          success:       'rgb(var(--p-success) / <alpha-value>)',
          warning:       'rgb(var(--p-warning) / <alpha-value>)',
          danger:        'rgb(var(--p-danger) / <alpha-value>)',
          scrim:         'rgb(var(--p-scrim) / <alpha-value>)',
        },
        // Appointments workspace tokens — see src/appointments/theme/appointments.css.
        // Only frontend/src/appointments uses these; its sweep test forbids the reverse.
        a: {
          canvas:         'rgb(var(--a-canvas) / <alpha-value>)',
          surface:        'rgb(var(--a-surface) / <alpha-value>)',
          'surface-2':    'rgb(var(--a-surface-2) / <alpha-value>)',
          text:           'rgb(var(--a-text) / <alpha-value>)',
          'text-2':       'rgb(var(--a-text-2) / <alpha-value>)',
          border:         'rgb(var(--a-border) / <alpha-value>)',
          side:           'rgb(var(--a-side) / <alpha-value>)',
          'side-2':       'rgb(var(--a-side-2) / <alpha-value>)',
          'side-text':    'rgb(var(--a-side-text) / <alpha-value>)',
          'side-text-2':  'rgb(var(--a-side-text-2) / <alpha-value>)',
          accent:         'rgb(var(--a-accent) / <alpha-value>)',
          'accent-ink':   'rgb(var(--a-accent-ink) / <alpha-value>)',
          'accent-deep':  'rgb(var(--a-accent-deep) / <alpha-value>)',
          danger:         'rgb(var(--a-danger) / <alpha-value>)',
          'st-pending':   'rgb(var(--a-st-pending) / <alpha-value>)',
          'st-confirmed': 'rgb(var(--a-st-confirmed) / <alpha-value>)',
          'st-progress':  'rgb(var(--a-st-progress) / <alpha-value>)',
          'st-completed': 'rgb(var(--a-st-completed) / <alpha-value>)',
          'st-cancelled': 'rgb(var(--a-st-cancelled) / <alpha-value>)',
          'st-noshow':    'rgb(var(--a-st-noshow) / <alpha-value>)',
        },
      },
      textColor: {
        primary: primaryText,
        accent:  textOnly('accent', 'var(--color-accent, 50 215 75)'),
        error:   textOnly('error', 'var(--color-error, 255 55 95)'),
        warning: textOnly('warning', 'var(--color-warning, 255 214 10)'),
        info:    textOnly('info', 'var(--color-info, 10 132 255)'),
        success: textOnly('success', '50 215 75'),
        danger:  textOnly('danger', '255 55 95'),
        notice:  textOnly('notice', '10 132 255'),
        ...shiftedText,
        ...greyText,
      },
      placeholderColor: greyText,
      borderRadius: {
        // Tailwind's own sizes, routed through variables a style can set.
        md:    'var(--radius-md, 0.375rem)',
        lg:    'var(--radius-lg, 0.5rem)',
        xl:    'var(--radius-xl, 0.75rem)',
        '2xl': 'var(--radius-2xl, 1rem)',
        '3xl': 'var(--radius-3xl, 1.5rem)',
        'p-card':    'var(--p-radius-card)',
        'p-control': 'var(--p-radius-control)',
      },
      boxShadow: {
        p: 'var(--p-shadow)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        'p-display': ['var(--p-font-display)'],
        'p-body': ['var(--p-font-body)'],
      },
    },
  },
  plugins: [
    // The Glass variable blocks, generated from src/theme/glassTokens.ts.
    plugin(({ addBase }) => {
      addBase({
        [GLASS_SCOPE]: glassVariables(),
        '@media (prefers-reduced-transparency: reduce)': { [GLASS_SCOPE]: glassSolidVariables() },
        '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': {
          [GLASS_SCOPE]: glassSolidVariables(),
        },
      })
    }),
  ],
}

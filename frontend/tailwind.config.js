/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  'rgb(var(--color-primary-50, 253 248 235) / <alpha-value>)',
          100: 'rgb(var(--color-primary-100, 249 237 204) / <alpha-value>)',
          200: 'rgb(var(--color-primary-200, 230 213 152) / <alpha-value>)',
          300: 'rgb(var(--color-primary-300, 217 194 114) / <alpha-value>)',
          400: 'rgb(var(--color-primary-400, 212 182 92) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500, 201 168 76) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600, 184 149 63) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700, 154 122 48) / <alpha-value>)',
          800: 'rgb(var(--color-primary-800, 131 109 49) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900, 107 84 32) / <alpha-value>)',
        },
        dark: {
          bg:       'rgb(var(--color-dark-bg, 13 13 13) / <alpha-value>)',
          surface:  'rgb(var(--color-dark-surface, 22 22 22) / <alpha-value>)',
          surface2: 'rgb(var(--color-dark-surface2, 30 30 30) / <alpha-value>)',
          surface3: 'rgb(var(--color-dark-surface3, 38 38 38) / <alpha-value>)',
          surface4: 'rgb(var(--color-dark-surface4, 46 46 46) / <alpha-value>)',
          // `card` and `hover` were used by 28 class names across the chatbot
          // and analytics screens but were never defined here, so Tailwind
          // generated nothing for them and those cards rendered with NO
          // background — which is why that part of the product looked like a
          // second, flatter design language rather than a styling choice.
          card:     'rgb(var(--color-dark-card, 30 30 30) / <alpha-value>)',
          hover:    'rgb(var(--color-dark-hover, 38 38 38) / <alpha-value>)',
          border:   'rgb(var(--color-dark-border, 44 44 44) / <alpha-value>)',
          border2:  'rgb(var(--color-dark-border2, 56 56 56) / <alpha-value>)',
        },
        't-primary':   'rgb(var(--color-text-primary, 255 255 255) / <alpha-value>)',
        't-secondary': 'rgb(var(--color-text-secondary, 142 142 147) / <alpha-value>)',
        't-muted':     'rgb(var(--color-dark-surface4, 46 46 46) / <alpha-value>)',
        accent:        'rgb(var(--color-accent, 50 215 75) / <alpha-value>)',
        error:         'rgb(var(--color-error, 255 55 95) / <alpha-value>)',
        warning:       'rgb(var(--color-warning, 255 214 10) / <alpha-value>)',
        info:          'rgb(var(--color-info, 10 132 255) / <alpha-value>)',
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
      borderRadius: {
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
  plugins: [],
}

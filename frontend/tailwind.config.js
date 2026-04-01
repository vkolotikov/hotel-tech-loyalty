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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

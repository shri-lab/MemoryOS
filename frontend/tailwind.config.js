/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        indigo: {
          primary: 'var(--indigo-primary)',
          deep: 'var(--indigo-deep)',
        },
        lavender: {
          light: 'var(--lavender-light)',
          mid: 'var(--lavender-mid)',
        },
        ink: 'var(--ink)',
        paper: 'var(--paper)',
        sage: {
          light: 'var(--sage-light)',
          dark: 'var(--sage-dark)',
        },
        clay: 'var(--clay)',
        taupe: {
          light: 'var(--taupe-light)',
        },
        charcoal: {
          deep: 'var(--charcoal-deep)',
        },
        status: {
          moss: 'var(--status-moss)',
          amber: 'var(--status-amber)',
          brick: 'var(--status-brick)',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}

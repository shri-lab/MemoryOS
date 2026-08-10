/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Keep old tokens pointing to new CSS variables or keep them aliased so that
        // any temporary/unmodified code doesn't crash, but configure the new theme colors
        indigo: {
          primary: 'var(--color-primary)',
          deep: 'var(--bg-base)',
        },
        lavender: {
          light: 'var(--bg-surface)',
          mid: 'var(--border-glass)',
        },
        ink: 'var(--text-primary)',
        paper: 'var(--bg-surface)',
        status: {
          moss: 'var(--status-emerald)',
          amber: 'var(--color-secondary)',
          brick: 'var(--status-coral)',
        },
        // Canonical Redesign Tokens
        obsidian: 'var(--bg-base)',
        glass: 'var(--bg-surface)',
        'glass-border': 'var(--border-glass)',
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        tertiary: 'var(--color-tertiary)',
        danger: 'var(--color-danger)',
        success: 'var(--status-emerald)',
        warning: 'var(--status-coral)',
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        sans: ['"Hanken Grotesk"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'cyan-glow': '0 0 15px rgba(62, 255, 196, 0.35)',
        'violet-glow': '0 0 20px rgba(62, 255, 196, 0.25)',
      }
    },
  },
  plugins: [],
}

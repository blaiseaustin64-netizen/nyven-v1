/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Every NYVEN color comes from the active theme (see src/index.css).
      // <alpha-value> keeps opacity classes working: bg-nyven-cyan/90, border-nyven-border/50 ...
      colors: {
        nyven: {
          bg: 'rgb(var(--nyven-bg-rgb) / <alpha-value>)',
          'bg-secondary': 'rgb(var(--nyven-bg-secondary-rgb) / <alpha-value>)',
          surface: 'rgb(var(--nyven-surface-rgb) / <alpha-value>)',
          'surface-2': 'rgb(var(--nyven-surface-2-rgb) / <alpha-value>)',
          text: 'rgb(var(--nyven-text-rgb) / <alpha-value>)',
          'text-secondary': 'rgb(var(--nyven-text-secondary-rgb) / <alpha-value>)',
          // border / hover / input carry their own base alpha in the theme
          border: 'rgb(var(--nyven-border-rgb) / calc(var(--nyven-border-a) * <alpha-value>))',
          hover: 'rgb(var(--nyven-hover-rgb) / calc(var(--nyven-hover-a) * <alpha-value>))',
          input: 'rgb(var(--nyven-input-bg-rgb) / calc(var(--nyven-input-bg-a) * <alpha-value>))',
          overlay: 'rgb(var(--nyven-overlay-rgb) / calc(var(--nyven-overlay-a) * <alpha-value>))',
          cyan: 'rgb(var(--nyven-cyan-rgb) / <alpha-value>)',
          violet: 'rgb(var(--nyven-violet-rgb) / <alpha-value>)',
          'on-accent': 'rgb(var(--nyven-on-accent-rgb) / <alpha-value>)',
          // shadow tint: strength follows the theme (strong in Dark, soft in Light)
          shade: 'rgb(var(--nyven-shadow-rgb) / calc(var(--nyven-shadow-a) * <alpha-value>))',
          knob: 'rgb(var(--nyven-knob-rgb) / <alpha-value>)',
        }
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'breathe': 'breathe 2.5s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { opacity: '0.85', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.03)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      boxShadow: {
        // glow strength comes from the theme (soft in Light, off in Dark)
        'nyven': '0 0 40px -10px var(--nyven-glow)',
        'nyven-violet': '0 0 40px -10px var(--nyven-glow-violet)',
        'nyven-pop': 'var(--nyven-shadow)',
      }
    },
  },
  plugins: [],
}

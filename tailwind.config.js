/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // One neutral ladder, separated by lightness instead of borders.
        ink: '#0B0B0C',
        surface: '#151517',
        surface2: '#1E1E21',
        chalk: '#F2F2EF',
        chalkdim: '#A3A3A8',
        line: '#26262A',
        // The single accent. It lives in index.css as --accent so the whole
        // app changes colour from one place (src/theme.js mirrors it for charts).
        accent: 'rgb(var(--accent) / <alpha-value>)',
        accentsoft: 'rgb(var(--accent) / 0.14)',
        // brass was the old gold call-to-action colour; it now means "accent".
        brass: 'rgb(var(--accent) / <alpha-value>)',
        brasssoft: 'rgb(var(--accent) / 0.14)',
        // iron is now strictly "danger": errors, delete, discard.
        iron: '#E5484D',
        irontext: '#FF6369',
        ironbtn: '#C42B31',
        ironsoft: '#3B1719',
        // Categories are told apart by their words, not by colour.
        cardio: '#8A8A90',
        cardiotext: '#A3A3A8',
        cardiosoft: '#1E1E21',
        good: '#4CAF7D',
        // good is too light for a chalk label (2.3:1); this one is 4.8:1.
        goodbtn: '#287548',
      },
      fontFamily: {
        // One family. Geist for Latin and numbers, Plex Sans Hebrew for Hebrew.
        display: ['Geist', '"IBM Plex Sans Hebrew"', 'system-ui', 'sans-serif'],
        body: ['Geist', '"IBM Plex Sans Hebrew"', 'system-ui', 'sans-serif'],
        mono: ['Geist', '"IBM Plex Sans Hebrew"', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        widest2: '0',
      },
      keyframes: {
        sheet: { from: { transform: 'translateY(16px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
      },
      animation: {
        sheet: 'sheet 500ms cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
}

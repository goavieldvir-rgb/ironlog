/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14161A',
        surface: '#1C1F26',
        surface2: '#252932',
        chalk: '#EDEDE6',
        chalkdim: '#9CA0AA',
        iron: '#D64545',
        ironsoft: '#3A2224',
        brass: '#C9A24B',
        brasssoft: '#33301F',
        cardio: '#4C8CC9',
        cardiosoft: '#1F2A38',
        line: '#31353E',
        good: '#4CAF7D',
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Rubik"', 'sans-serif'],
        body: ['Inter', '"Rubik"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"Rubik"', 'monospace'],
      },
      letterSpacing: {
        widest2: '.18em',
      },
    },
  },
  plugins: [],
}

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
        // iron fails 4.5:1 as small text on the dark surfaces and as a
        // button fill under chalk labels, so each job has its own red.
        irontext: '#EF6A6A',
        ironbtn: '#B33636',
        ironsoft: '#3A2224',
        brass: '#C9A24B',
        brasssoft: '#33301F',
        cardio: '#4C8CC9',
        cardiotext: '#6E9FD6',
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

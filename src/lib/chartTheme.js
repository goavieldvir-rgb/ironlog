// One look for every recharts chart (Stats, nutrition averages): the
// tailwind palette as hex, a quiet axis, and the app's dark tooltip.

export const CHART = {
  iron: '#D64545',
  brass: '#C9A24B',
  cardio: '#4C8CC9',
  good: '#4CAF7D',
  chalk: '#EDEDE6',
  chalkdim: '#9CA0AA',
  line: '#31353E',
  surface: '#1C1F26',
}

export const axisProps = { stroke: CHART.chalkdim, fontSize: 12, tickLine: false, axisLine: false }

export const tooltipProps = {
  cursor: { fill: 'rgba(237,237,230,0.05)' },
  contentStyle: { background: CHART.surface, border: `1px solid ${CHART.line}`, borderRadius: 8, fontSize: 13 },
  labelStyle: { color: CHART.chalk },
  itemStyle: { color: CHART.chalk },
}


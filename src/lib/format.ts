export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

export function formatPercent(value: number, max = 100): string {
  const pct = max === 100 ? value : (value / max) * 100
  return `${Math.round(pct)}%`
}

export function formatSigned(value: number, digits = 0): string {
  const rounded = value.toFixed(digits)
  const num = Number(rounded)
  if (num > 0) return `+${rounded}`
  if (num < 0) return rounded
  return digits > 0 ? Number(0).toFixed(digits) : '0'
}

export function formatTrend(value: number): string {
  if (value > 0.02) return `↑${Math.round(value * 100)}%`
  if (value < -0.02) return `↓${Math.abs(Math.round(value * 100))}%`
  return '→0%'
}

export function formatCelsius(value: number): string {
  return `${Math.round(value)}°C`
}

export function formatDay(time: { year: number; month: number; day: number }): string {
  return `YEAR ${time.year} · MONTH ${time.month} · DAY ${time.day}`
}

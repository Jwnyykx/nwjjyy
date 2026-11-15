export const DEFAULT_ZONE = 'Asia/Shanghai'
const DAY = 86_400_000

function utcDate(year: number, month: number, day: number) {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

export function todayIn(zone = DEFAULT_ZONE, now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const part = (name: string) => parts.find(value => value.type === name)?.value ?? ''
  return [part('year').padStart(4, '0'), part('month'), part('day')].join('-')
}

export function dateLabel(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return year + ' 年 ' + month + ' 月 ' + day + ' 日'
}

function dateNumber(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return utcDate(year, month, day).getTime() / DAY
}

export function anniversaryDays(date: string, today: string) {
  const elapsed = dateNumber(today) - dateNumber(date)
  if (elapsed < 0) return { elapsed, remaining: -elapsed }
  const [, month, day] = date.split('-').map(Number)
  const year = Number(today.slice(0, 4))
  const thisYear = anniversaryIn(year, month, day)
  const next = thisYear >= dateNumber(today) ? thisYear : anniversaryIn(year + 1, month, day)
  return { elapsed, remaining: next - dateNumber(today) }
}

function anniversaryIn(year: number, month: number, day: number) {
  const daysInMonth = utcDate(year, month + 1, 0).getUTCDate()
  return utcDate(year, month, Math.min(day, daysInMonth)).getTime() / DAY
}

export function dateRange(year: string, month = '') {
  if (!/^\d{4}$/.test(year) || Number(year) === 0) return null
  const selectedMonth = /^(0[1-9]|1[0-2])$/.test(month) ? month : ''
  const start = year + '-' + (selectedMonth || '01') + '-01'
  const terminalMonth = selectedMonth ? Number(selectedMonth) : 12
  const end = utcDate(Number(year), terminalMonth + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const timestamp = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

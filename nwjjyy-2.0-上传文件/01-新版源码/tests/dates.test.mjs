import test from 'node:test'
import assert from 'node:assert/strict'
import { anniversaryDays, dateRange, todayIn, validDate } from '../src/data/dates.ts'

test('calendar days follow the selected timezone across midnight and daylight saving', () => {
  const time = new Date('2026-01-10T16:00:00Z')
  assert.equal(todayIn('Asia/Shanghai', time), '2026-01-11')
  assert.equal(todayIn('America/Los_Angeles', time), '2026-01-10')
  assert.equal(anniversaryDays('2026-03-07', '2026-03-09').elapsed, 2)
})
test('leap day anniversaries and filters use real date bounds', () => {
  assert.deepEqual(dateRange('2024', '02'), { start: '2024-02-01', end: '2024-02-29' })
  assert.deepEqual(dateRange('9999'), { start: '9999-01-01', end: '9999-12-31' })
  assert.equal(anniversaryDays('2024-02-29', '2025-02-28').remaining, 0)
  assert.deepEqual(anniversaryDays('2026-01-12', '2026-01-10'), { elapsed: -2, remaining: 2 })
  assert.equal(validDate('2025-02-29'), false)
  assert.equal(validDate('0001-01-01'), true)
})

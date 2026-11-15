export function YearMonth({ years, year, month, onYear, onMonth }: {
  years: number[]; year: string; month?: string; onYear: (value: string) => void; onMonth?: (value: string) => void
}) {
  return <>
    <label>年份<select value={year} onChange={event => onYear(event.target.value)}>
      <option value="">全部年份</option>{years.map(value => <option key={value} value={String(value).padStart(4, '0')}>{value} 年</option>)}
    </select></label>
    {onMonth && <label>月份<select disabled={!year} value={month} onChange={event => onMonth(event.target.value)}>
      <option value="">全部月份</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{i + 1} 月</option>)}
    </select></label>}
  </>
}

export function Pagination({ page, next, go }: { page: number; next: boolean; go: (page: number) => void }) {
  if (!next && !page) return null
  return <nav className="pagination" aria-label="分页">
    <button className="button secondary small" disabled={!page} onClick={() => go(page - 1)}>上一页</button>
    <span>第 {page + 1} 页</span>
    <button className="button secondary small" disabled={!next} onClick={() => go(page + 1)}>下一页</button>
  </nav>
}

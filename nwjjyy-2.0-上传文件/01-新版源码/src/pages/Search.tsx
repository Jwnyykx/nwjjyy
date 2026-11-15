import { useState } from 'react'
import { ArrowUpRight, Search as SearchIcon } from 'lucide-react'
import { Link } from 'react-router'
import { useBook } from '../book-context'
import { db, unwrap } from '../data/client'
import { dateLabel } from '../data/dates'
import type { SearchResult } from '../data/types'
import { useLoad } from '../hooks'
import { Empty, Feedback, PageHeading } from '../ui/feedback'
import { Pagination } from '../ui/filters'

const labels = { story: '故事', diary: '日记', photo: '照片', chapter: '章节', trip: '相见记录' }
const destinations = {
  story: '/stories/', diary: '/diary?entry=', photo: '/album?photo=', chapter: '/stories?view=chapters&chapter=', trip: '/footprints/',
}

function Highlight({ value, keyword }: { value: string; keyword: string }) {
  if (!keyword) return value
  const start = value.toLowerCase().indexOf(keyword.toLowerCase())
  return start < 0 ? value : <>{value.slice(0, start)}<mark>{value.slice(start, start + keyword.length)}</mark>{value.slice(start + keyword.length)}</>
}

export default function SearchPage() {
  const { categories } = useBook()
  const [input, setInput] = useState({ term: '', from: '', to: '', category: '' })
  const [criteria, setCriteria] = useState(input)
  const [page, setPage] = useState(0)
  const result = useLoad(JSON.stringify([criteria, page]), async () => {
    if (!criteria.term) return null
    return unwrap(await db().rpc('search_book', {
      term: criteria.term, from_date: criteria.from || null, to_date: criteria.to || null,
      category_filter: criteria.category || null, start_at: page * 12,
    })) ?? []
  })
  const rows = result.data?.slice(0, 12) ?? []
  const term = criteria.term
  const update = (field: keyof typeof input, value: string) => setInput(previous => ({ ...previous, [field]: value }))
  return <section className="page narrow-page search-page">
    <PageHeading title="找一段回忆" intro="可以从一句话、地名、照片说明或日期找回那一天。" />
    <form className="panel form-stack" onSubmit={event => {
      event.preventDefault()
      setPage(0)
      setCriteria({ ...input, term: input.term.trim() })
    }}>
      <label>关键词<input required value={input.term} maxLength={100} onChange={event => update('term', event.target.value)} /></label>
      <div className="form-grid">
        <label>最早日期<input type="date" value={input.from} max={input.to || undefined} onChange={event => update('from', event.target.value)} /></label>
        <label>最晚日期<input type="date" value={input.to} min={input.from || undefined} onChange={event => update('to', event.target.value)} /></label>
      </div>
      <label>分类<select value={input.category} onChange={event => update('category', event.target.value)}>
        <option value="">所有分类</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button className="button"><SearchIcon size={17} />搜索</button>
    </form>
    {term && <Feedback loading={result.loading} error={result.error} retry={result.reload} />}
    {result.data && !rows.length && <Empty title="这次没有找到对应的回忆">试试换一个词，或去掉日期筛选。</Empty>}
    <div className="search-results">{rows.map((row: SearchResult) => <Link className="panel" to={destinations[row.kind] + row.item_id} key={row.kind + ':' + row.item_id}>
      <div className="metadata"><span>{labels[row.kind]}</span>{row.recorded_on && <time dateTime={row.recorded_on}>{dateLabel(row.recorded_on)}</time>}</div>
      <h2><Highlight value={row.title} keyword={term} /> <ArrowUpRight size={16} /></h2>
      {row.excerpt && <p><Highlight value={row.excerpt} keyword={term} /></p>}
    </Link>)}</div>
    {result.data && <Pagination page={page} next={result.data.length > 12} go={setPage} />}
  </section>
}

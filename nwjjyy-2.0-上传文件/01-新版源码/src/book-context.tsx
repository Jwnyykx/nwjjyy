import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { directory } from './data/book'
import type { Member } from './data/types'
import { useLoad } from './hooks'
import { Feedback } from './ui/feedback'

type Directory = Awaited<ReturnType<typeof directory>>
type BookContextValue = Directory & { member: Member; refresh: () => void }
const BookContext = createContext<BookContextValue | null>(null)

export function BookProvider({ member, children }: { member: Member; children: ReactNode }) {
  const result = useLoad(member.id, directory, true)
  if (!result.data) return <Feedback loading={result.loading} error={result.error} retry={result.reload} />
  return <BookContext.Provider value={{ ...result.data, member, refresh: result.reload }}>
    {result.error && <Feedback error={result.error} retry={result.reload} />}
    {children}
  </BookContext.Provider>
}

export function useBook() {
  const book = useContext(BookContext)
  if (!book) throw new Error('无法读取故事书。')
  return book
}

import { createRoot } from 'react-dom/client'
import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { createHashRouter, Link, RouterProvider } from 'react-router'
import { BookLayout, RootLayout } from './ui/layout'
import { Cover, Login } from './pages/Cover'
import { Empty, Feedback } from './ui/feedback'
import './styles.css'
import './edition.css'

const Home = lazy(() => import('./pages/Home'))
const Timeline = lazy(() => import('./pages/Timeline'))
const Story = lazy(() => import('./pages/Story'))
const Album = lazy(() => import('./pages/Album'))
const Diary = lazy(() => import('./pages/Diaries'))
const Promises = lazy(() => import('./pages/Promises'))
const Manage = lazy(() => import('./pages/Manage'))
const Editor = lazy(() => import('./pages/Editor'))
const Settings = lazy(() => import('./pages/Settings'))
const Export = lazy(() => import('./pages/Export'))
const More = lazy(() => import('./pages/More'))
const Chapters = lazy(() => import('./pages/Chapters'))
const Letters = lazy(() => import('./pages/Letters'))
const Footprints = lazy(() => import('./pages/Footprints'))
const Sounds = lazy(() => import('./pages/Sounds'))
const Post = lazy(() => import('./pages/Post'))
const Entrances = lazy(() => import('./pages/Entrances'))
const Gift = lazy(() => import('./pages/Entrances').then(module => ({ default: module.Gift })))
const RandomPage = lazy(() => import('./pages/Entrances').then(module => ({ default: module.RandomPage })))
const Collections = lazy(() => import('./pages/Collections'))
const Search = lazy(() => import('./pages/Search'))
const StoryHistory = lazy(() => import('./pages/StoryHistory'))
const Years = lazy(() => import('./pages/Years'))
const Cinema = lazy(() => import('./pages/Cinema'))

function delayed(view: ReactNode) {
  return <Suspense fallback={<Feedback loading />}>{view}</Suspense>
}

const router = createHashRouter([{
  element: <RootLayout />,
  errorElement: <div className="page shell"><Empty title="这一页暂时打不开"
    action={<a className="button" href="./">返回封面</a>}>可以刷新页面后再试一次。</Empty></div>,
  children: [
    { index: true, element: <Cover /> },
    { path: 'login', element: <Login /> },
    { element: <BookLayout />, children: [
      { path: 'book', element: delayed(<Home />) },
      { path: 'stories', element: delayed(<Timeline />) },
      { path: 'stories/:id', element: delayed(<Story />) },
      { path: 'album', element: delayed(<Album />) },
      { path: 'diary', element: delayed(<Diary />) },
      { path: 'promises', element: delayed(<Promises />) },
      { path: 'edit/:kind/:id', element: delayed(<Editor />) },
      { path: 'manage', element: delayed(<Manage />) },
      { path: 'settings', element: delayed(<Settings />) },
      { path: 'export', element: delayed(<Export />) },
      { path: 'more', element: delayed(<More />) },
      { path: 'chapters', element: delayed(<Chapters />) },
      { path: 'letters', element: delayed(<Letters />) },
      { path: 'footprints/:id?', element: delayed(<Footprints />) },
      { path: 'sounds', element: delayed(<Sounds />) },
      { path: 'post', element: delayed(<Post />) },
      { path: 'entrances', element: delayed(<Entrances />) },
      { path: 'gift', element: delayed(<Gift />) },
      { path: 'memory', element: delayed(<RandomPage />) },
      { path: 'collections/:id?', element: delayed(<Collections />) },
      { path: 'search', element: delayed(<Search />) },
      { path: 'history/:id', element: delayed(<StoryHistory />) },
      { path: 'years', element: delayed(<Years />) },
      { path: 'cinema', element: delayed(<Cinema />) },
    ] },
    { path: '*', element: <div className="page shell"><Empty title="没有找到这一页"
      action={<Link className="button" to="/">返回封面</Link>} /></div> },
  ],
}])

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', window.location.href)).catch(() => {
      // Installation is optional; online reading still works.
    })
  })
}

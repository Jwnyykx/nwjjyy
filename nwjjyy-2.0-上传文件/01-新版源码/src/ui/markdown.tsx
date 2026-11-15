import ReactMarkdown from 'react-markdown'
import type { Media } from '../data/types'
import { PrivateImage } from './media'

export function Markdown({ text, photos = [], pending = [], onPhoto }: {
  text: string
  photos?: Media[]
  pending?: { id: string; src: string; caption: string }[]
  onPhoto?: (index: number) => void
}) {
  return <div className="markdown">
    <ReactMarkdown skipHtml
      allowedElements={['p', 'em', 'strong', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'hr', 'br', 'img', 'a', 'code']}
      unwrapDisallowed
      urlTransform={(value, key) => key === 'src' && /^photo:[a-f0-9-]{36}$/.test(value) ? value : ''}
      components={{
        a: ({ children }) => <>{children}</>,
        img: ({ src, alt }) => {
          const index = photos.findIndex(photo => 'photo:' + photo.id === src)
          if (index < 0) {
            const photo = pending.find(item => 'photo:' + item.id === src)
            return photo && <span className="inline-photo">
              <span className="private-image"><img src={photo.src} alt={alt || photo.caption || '预览照片'} /></span>
              {(alt || photo.caption) && <span className="photo-caption">{alt || photo.caption}</span>}
            </span>
          }
          const photo = photos[index]
          return <span className="inline-photo">
            {onPhoto
              ? <button type="button" className="photo-button" aria-label={alt || '放大照片'} onClick={() => onPhoto(index)}>
                  <PrivateImage item={photo} alt={alt} />
                </button>
              : <PrivateImage item={photo} alt={alt} />}
            {(alt || photo.caption) && <span className="photo-caption">{alt || photo.caption}</span>}
          </span>
        },
      }}>{text}</ReactMarkdown>
  </div>
}

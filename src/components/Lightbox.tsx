import { useEffect } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './Icon'

interface LightboxProps {
  photos: string[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
}

export function Lightbox({ photos, index, onClose, onNavigate }: LightboxProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onNavigate((index - 1 + photos.length) % photos.length)
      if (e.key === 'ArrowRight') onNavigate((index + 1) % photos.length)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [index, photos.length, onClose, onNavigate])

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        <CloseIcon />
      </button>

      {photos.length > 1 && (
        <button
          className="lightbox-nav lightbox-prev"
          aria-label="Previous photo"
          onClick={(e) => {
            e.stopPropagation()
            onNavigate((index - 1 + photos.length) % photos.length)
          }}
        >
          <ChevronLeftIcon />
        </button>
      )}

      <img
        src={photos[index]}
        alt={`Photo ${index + 1} of ${photos.length}`}
        className="lightbox-image"
        onClick={(e) => e.stopPropagation()}
      />

      {photos.length > 1 && (
        <button
          className="lightbox-nav lightbox-next"
          aria-label="Next photo"
          onClick={(e) => {
            e.stopPropagation()
            onNavigate((index + 1) % photos.length)
          }}
        >
          <ChevronRightIcon />
        </button>
      )}

      {photos.length > 1 && (
        <div className="lightbox-counter">
          {index + 1} / {photos.length}
        </div>
      )}
    </div>
  )
}

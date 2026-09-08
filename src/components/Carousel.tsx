import { useState } from 'react'
import { Lightbox } from './Lightbox'

export function Carousel({ photos }: { photos: string[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  if (photos.length === 0) return null

  return (
    <>
      <div className="carousel">
        {photos.map((url, i) => (
          <button
            key={url}
            type="button"
            className="carousel-thumb"
            onClick={() => setOpenIndex(i)}
            aria-label={`Open photo ${i + 1} of ${photos.length}`}
          >
            <img src={url} alt="" loading="lazy" />
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <Lightbox
          photos={photos}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onNavigate={setOpenIndex}
        />
      )}
    </>
  )
}

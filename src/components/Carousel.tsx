import { useState } from 'react'
import { Lightbox } from './Lightbox'

export function Carousel({ photos }: { photos: string[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  if (photos.length === 0) return null

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {photos.map((url, i) => (
          <button
            key={url}
            type="button"
            className="h-20 w-20 flex-none scroll-ml-2 overflow-hidden rounded-lg border border-gray-100 bg-gray-100"
            onClick={() => setOpenIndex(i)}
            aria-label={`Open photo ${i + 1} of ${photos.length}`}
          >
            <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
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

import { jsPDF } from 'jspdf'
import type { Entry, Property } from '../types'
import { PHOTOS_BUCKET, supabase } from './supabaseClient'

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  const datePart = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${datePart}, ${timePart}`
}

interface LoadedImage {
  dataUrl: string
  width: number
  height: number
}

async function loadImage(url: string): Promise<LoadedImage | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.width, height: img.height })
      img.src = dataUrl
    })
    return { dataUrl, ...dims }
  } catch {
    return null
  }
}

const PHOTOS_PER_ROW = 3
const TILE_GAP = 10
const TILE_HEIGHT = 130

export async function exportEntriesToPdf(property: Property, entries: Entry[], dateLabel: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentWidth = pageWidth - margin * 2
  const tileWidth = (contentWidth - TILE_GAP * (PHOTOS_PER_ROW - 1)) / PHOTOS_PER_ROW

  doc.setFontSize(18)
  doc.text(`${property.name} — Progress Report`, margin, margin)
  doc.setFontSize(11)
  doc.setTextColor(90)
  doc.text(dateLabel, margin, margin + 18)
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, margin + 34)
  doc.setTextColor(0)

  let y = margin + 60

  if (entries.length === 0) {
    doc.setFontSize(12)
    doc.text('No entries found for the selected date(s).', margin, y)
  }

  for (const entry of entries) {
    const images = await Promise.all(
      entry.photo_paths.map((path) => {
        const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path)
        return loadImage(data.publicUrl)
      })
    )
    const loadedImages = images.filter((img): img is LoadedImage => img !== null)

    const noteLines = doc.splitTextToSize(entry.note || '(no note)', contentWidth)
    const metaLine = `Uploaded by ${entry.uploader_name} · ${formatTimestamp(entry.created_at)}`
    const photoRows = Math.ceil(loadedImages.length / PHOTOS_PER_ROW)
    const photosHeight = photoRows > 0 ? photoRows * TILE_HEIGHT + (photoRows - 1) * TILE_GAP + 14 : 0
    const neededHeight = 16 + noteLines.length * 14 + 14 + photosHeight + 24

    if (y + neededHeight > pageHeight - margin) {
      doc.addPage()
      y = margin
    }

    doc.setFontSize(10)
    doc.setTextColor(110)
    doc.text(metaLine, margin, y)
    y += 16

    doc.setFontSize(11)
    doc.setTextColor(20)
    doc.text(noteLines, margin, y)
    y += noteLines.length * 14 + 14

    loadedImages.forEach((image, i) => {
      const col = i % PHOTOS_PER_ROW
      const row = Math.floor(i / PHOTOS_PER_ROW)
      const ratio = Math.min(tileWidth / image.width, TILE_HEIGHT / image.height, 1)
      const drawWidth = image.width * ratio
      const drawHeight = image.height * ratio
      const tileX = margin + col * (tileWidth + TILE_GAP)
      const tileY = y + row * (TILE_HEIGHT + TILE_GAP)
      const offsetX = (tileWidth - drawWidth) / 2
      const format = image.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      doc.addImage(image.dataUrl, format, tileX + offsetX, tileY, drawWidth, drawHeight)
    })

    y += photosHeight + 10

    doc.setDrawColor(220)
    doc.line(margin, y - 8, pageWidth - margin, y - 8)
  }

  const safeName = property.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  doc.save(`${safeName}-progress-report.pdf`)
}

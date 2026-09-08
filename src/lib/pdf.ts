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

async function loadImage(url: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
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

export async function exportEntriesToPdf(property: Property, entries: Entry[], dateLabel: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const maxImageWidth = pageWidth - margin * 2
  const maxImageHeight = 260

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
    const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(entry.photo_path)
    const image = await loadImage(data.publicUrl)

    let imageHeight = 0
    if (image) {
      const ratio = Math.min(maxImageWidth / image.width, maxImageHeight / image.height, 1)
      imageHeight = image.height * ratio
    }

    const noteLines = doc.splitTextToSize(entry.note || '(no note)', maxImageWidth)
    const metaLine = `Uploaded by ${entry.uploader_name} · ${formatTimestamp(entry.created_at)}`
    const neededHeight = imageHeight + 20 + noteLines.length * 14 + 20 + 24

    if (y + neededHeight > pageHeight - margin) {
      doc.addPage()
      y = margin
    }

    if (image) {
      const ratio = Math.min(maxImageWidth / image.width, maxImageHeight / image.height, 1)
      const drawWidth = image.width * ratio
      const drawHeight = image.height * ratio
      const format = image.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      doc.addImage(image.dataUrl, format, margin, y, drawWidth, drawHeight)
      y += drawHeight + 12
    }

    doc.setFontSize(10)
    doc.setTextColor(110)
    doc.text(metaLine, margin, y)
    y += 16

    doc.setFontSize(11)
    doc.setTextColor(20)
    doc.text(noteLines, margin, y)
    y += noteLines.length * 14 + 20

    doc.setDrawColor(220)
    doc.line(margin, y - 8, pageWidth - margin, y - 8)
  }

  const safeName = property.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  doc.save(`${safeName}-progress-report.pdf`)
}

import { jsPDF } from 'jspdf'
import type { Property } from '../types'
import type { DayReport } from './reportDays'
import { progressColorRgb } from './progress'

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

export async function exportReportToPdf(
  property: Property,
  dayReports: DayReport[],
  generatedByName: string,
  generatedAt: Date
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentWidth = pageWidth - margin * 2
  const tileWidth = (contentWidth - TILE_GAP * (PHOTOS_PER_ROW - 1)) / PHOTOS_PER_ROW

  doc.setFontSize(18)
  doc.setTextColor(0)
  doc.text(`${property.name} — Progress Report`, margin, margin)
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(`Generated ${generatedAt.toLocaleString()} by ${generatedByName}`, margin, margin + 18)
  doc.setTextColor(0)

  let y = margin + 44

  function ensureSpace(needed: number) {
    if (y + needed > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }

  if (dayReports.length === 0) {
    doc.setFontSize(12)
    doc.text('No days found for the selected date(s).', margin, y)
  }

  for (const day of dayReports) {
    ensureSpace(70)

    doc.setFontSize(14)
    doc.setTextColor(20)
    doc.text(day.dateLabel, margin, y)
    y += 20

    // Progress bar, battery-style: outline + colored fill + centered %.
    const barWidth = contentWidth
    const barHeight = 16
    doc.setDrawColor(0)
    doc.setFillColor(240, 240, 240)
    doc.roundedRect(margin, y, barWidth, barHeight, 4, 4, 'FD')
    const fillWidth = Math.max(4, (day.progressPercent / 100) * barWidth)
    const { r, g, b } = progressColorRgb(day.progressPercent)
    doc.setFillColor(r, g, b)
    doc.roundedRect(margin, y, fillWidth, barHeight, 4, 4, 'F')
    doc.setFontSize(9)
    doc.setTextColor(20)
    const pctLabel = `${day.progressPercent}%`
    doc.text(pctLabel, margin + barWidth / 2 - doc.getTextWidth(pctLabel) / 2, y + barHeight - 5)
    y += barHeight + 18

    // Checklist — fully expanded in the PDF, no collapsing.
    if (day.checklistSections.length > 0) {
      for (const section of day.checklistSections) {
        ensureSpace(18)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(20)
        doc.text(section.headerTitle, margin, y)
        doc.setFont('helvetica', 'normal')
        y += 15
        for (const point of section.points) {
          ensureSpace(14)
          doc.setFontSize(10)
          doc.setTextColor(60)
          doc.text(`[x] ${point.title}`, margin + 14, y)
          y += 13
        }
        y += 6
      }
      y += 4
    }

    // Photos.
    if (day.photoUrls.length > 0) {
      const images = await Promise.all(day.photoUrls.map(loadImage))
      const loadedImages = images.filter((img): img is LoadedImage => img !== null)
      if (loadedImages.length > 0) {
        const photoRows = Math.ceil(loadedImages.length / PHOTOS_PER_ROW)
        const photosHeight = photoRows * TILE_HEIGHT + (photoRows - 1) * TILE_GAP
        ensureSpace(photosHeight + 20)
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
        y += photosHeight + 16
      }
    }

    // Notes.
    if (day.notes.length > 0) {
      for (const note of day.notes) {
        const metaLine = `${note.uploaderName} · ${formatTimestamp(note.createdAt)}`
        const noteLines = doc.splitTextToSize(note.note, contentWidth)
        ensureSpace(14 + noteLines.length * 14 + 10)
        doc.setFontSize(9)
        doc.setTextColor(110)
        doc.text(metaLine, margin, y)
        y += 13
        doc.setFontSize(11)
        doc.setTextColor(20)
        doc.text(noteLines, margin, y)
        y += noteLines.length * 14 + 10
      }
    }

    if (day.checklistSections.length === 0 && day.photoUrls.length === 0 && day.notes.length === 0) {
      doc.setFontSize(10)
      doc.setTextColor(140)
      doc.text('No new activity recorded this day.', margin, y)
      y += 16
    }

    y += 10
    doc.setDrawColor(220)
    doc.line(margin, y - 6, pageWidth - margin, y - 6)
    y += 14
  }

  const safeName = property.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  doc.save(`${safeName}-progress-report.pdf`)
}

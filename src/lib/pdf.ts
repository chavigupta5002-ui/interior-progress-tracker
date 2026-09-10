import { jsPDF } from 'jspdf'
import type { Property } from '../types'
import type { DayReport } from './reportDays'
import logoUrl from '../assets/logo-navbar.png'

// Tailwind emerald-600, matching the app's "success / active progress" color.
const EMERALD = { r: 5, g: 150, b: 105 }
const GRAY_50 = { r: 249, g: 250, b: 251 }
const GRAY_100 = { r: 243, g: 244, b: 246 }
const GRAY_900 = { r: 17, g: 24, b: 39 }
const GRAY_700 = { r: 55, g: 65, b: 81 }
const GRAY_500 = { r: 107, g: 114, b: 128 }
const GRAY_400 = { r: 156, g: 163, b: 175 }

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
const TILE_GAP = 8
const TILE_HEIGHT = 120
const MARGIN = 72 // 1 inch
const BANNER_HEIGHT = 108 // 1.5 inch

export async function exportReportToPdf(
  property: Property,
  dayReports: DayReport[],
  generatedByName: string,
  generatedAt: Date
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - MARGIN * 2
  const tileWidth = (contentWidth - TILE_GAP * (PHOTOS_PER_ROW - 1)) / PHOTOS_PER_ROW

  // Compact top banner: logo, property name, export date.
  doc.setFillColor(GRAY_50.r, GRAY_50.g, GRAY_50.b)
  doc.rect(0, 0, pageWidth, BANNER_HEIGHT, 'F')
  doc.setDrawColor(GRAY_100.r, GRAY_100.g, GRAY_100.b)
  doc.line(0, BANNER_HEIGHT, pageWidth, BANNER_HEIGHT)

  let textX = MARGIN
  const logo = await loadImage(logoUrl)
  if (logo) {
    const logoHeight = 30
    const logoWidth = (logo.width / logo.height) * logoHeight
    const format = logo.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
    doc.addImage(logo.dataUrl, format, MARGIN, (BANNER_HEIGHT - logoHeight) / 2, logoWidth, logoHeight)
    textX = MARGIN + logoWidth + 16
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b)
  doc.text(property.name, textX, BANNER_HEIGHT / 2 - 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b)
  doc.text(`Generated ${generatedAt.toLocaleString()} by ${generatedByName}`, textX, BANNER_HEIGHT / 2 + 14)

  let y = BANNER_HEIGHT + 30

  function ensureSpace(needed: number) {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage()
      y = MARGIN
    }
  }

  if (dayReports.length === 0) {
    doc.setFontSize(12)
    doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b)
    doc.text('No days found for the selected date(s).', MARGIN, y)
  }

  for (const day of dayReports) {
    ensureSpace(70)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b)
    doc.text(day.dateLabel, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    y += 18

    // Progress bar: rounded gray track + emerald fill, matching the app UI.
    const barWidth = contentWidth
    const barHeight = 8
    doc.setFillColor(GRAY_100.r, GRAY_100.g, GRAY_100.b)
    doc.roundedRect(MARGIN, y, barWidth, barHeight, 4, 4, 'F')
    const fillWidth = Math.max(6, (day.progressPercent / 100) * barWidth)
    doc.setFillColor(EMERALD.r, EMERALD.g, EMERALD.b)
    doc.roundedRect(MARGIN, y, fillWidth, barHeight, 4, 4, 'F')
    y += barHeight + 8
    doc.setFontSize(9)
    doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b)
    doc.text(`${day.progressPercent}% complete`, MARGIN, y)
    y += 16

    // Checklist — fully expanded in the PDF, no collapsing.
    if (day.checklistSections.length > 0) {
      for (const section of day.checklistSections) {
        ensureSpace(18)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b)
        doc.text(section.headerTitle, MARGIN, y)
        doc.setFont('helvetica', 'normal')
        y += 15
        for (const point of section.points) {
          ensureSpace(14)
          doc.setFontSize(10)
          doc.setTextColor(EMERALD.r, EMERALD.g, EMERALD.b)
          doc.text('✓', MARGIN + 4, y)
          doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b)
          doc.text(point.title, MARGIN + 16, y)
          y += 13
        }
        y += 6
      }
      y += 4
    }

    // Photos, in a strict grid so tiles stay uniform and never overlap.
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
          const tileX = MARGIN + col * (tileWidth + TILE_GAP)
          const tileY = y + row * (TILE_HEIGHT + TILE_GAP)
          // Cover-fit into the tile (uniform aspect ratio, cropped, never overlapping).
          const coverRatio = Math.max(tileWidth / image.width, TILE_HEIGHT / image.height)
          const drawWidth = image.width * coverRatio
          const drawHeight = image.height * coverRatio
          const offsetX = (tileWidth - drawWidth) / 2
          const offsetY = (TILE_HEIGHT - drawHeight) / 2
          const format = image.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
          doc.saveGraphicsState()
          // Cast needed since jsPDF's clip() typing is inconsistent across versions.
          ;(doc.rect(tileX, tileY, tileWidth, TILE_HEIGHT, null) as unknown as { clip: () => void }).clip()
          doc.addImage(image.dataUrl, format, tileX + offsetX, tileY + offsetY, drawWidth, drawHeight)
          doc.restoreGraphicsState()
        })
        y += photosHeight + 16
      }
    }

    // Notes.
    if (day.notes.length > 0) {
      ensureSpace(16)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b)
      doc.text('Notes added by team', MARGIN, y)
      doc.setFont('helvetica', 'normal')
      y += 16

      for (const note of day.notes) {
        const metaLine = `${note.uploaderName} · ${formatTimestamp(note.createdAt)}`
        const noteLines = doc.splitTextToSize(note.note, contentWidth)
        ensureSpace(14 + noteLines.length * 14 + 10)
        doc.setFontSize(9)
        doc.setTextColor(GRAY_400.r, GRAY_400.g, GRAY_400.b)
        doc.text(metaLine, MARGIN, y)
        y += 13
        doc.setFontSize(11)
        doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b)
        doc.text(noteLines, MARGIN, y)
        y += noteLines.length * 14 + 10
      }
    }

    if (day.checklistSections.length === 0 && day.photoUrls.length === 0 && day.notes.length === 0) {
      doc.setFontSize(10)
      doc.setTextColor(GRAY_400.r, GRAY_400.g, GRAY_400.b)
      doc.text('No new activity recorded this day.', MARGIN, y)
      y += 16
    }

    y += 10
    doc.setDrawColor(GRAY_100.r, GRAY_100.g, GRAY_100.b)
    doc.line(MARGIN, y - 6, pageWidth - MARGIN, y - 6)
    y += 14
  }

  const safeName = property.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  doc.save(`${safeName}-progress-report.pdf`)
}

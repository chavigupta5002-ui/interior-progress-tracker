import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Entry, Property, ScopeHeader, ScopePoint } from '../types'
import { Carousel } from '../components/Carousel'
import { ProgressBar } from '../components/ProgressBar'
import { exportReportToPdf } from '../lib/pdf'
import { buildDayReports, enumerateDateRange } from '../lib/reportDays'
import { BackArrowIcon, DownloadIcon } from '../components/Icon'

type DateMode = 'single' | 'range' | 'multiple'

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  const datePart = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${datePart}, ${timePart}`
}

export function Reports() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const preselectedPropertyId = searchParams.get('propertyId')

  const [properties, setProperties] = useState<Property[]>([])
  const [propertyId, setPropertyId] = useState<string>(preselectedPropertyId ?? '')
  const [mode, setMode] = useState<DateMode>('single')
  const [singleDate, setSingleDate] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [multiInput, setMultiInput] = useState('')
  const [multiDates, setMultiDates] = useState<string[]>([])

  const [allEntries, setAllEntries] = useState<Entry[]>([])
  const [scopeHeaders, setScopeHeaders] = useState<ScopeHeader[]>([])
  const [scopePoints, setScopePoints] = useState<ScopePoint[]>([])
  const [loading, setLoading] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('properties')
      .select('*')
      .order('name')
      .then(({ data }) => {
        setProperties(data ?? [])
        if (!propertyId && data && data.length > 0) setPropertyId(data[0].id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedProperty = properties.find((p) => p.id === propertyId) ?? null

  const dateKeys = useMemo(() => {
    if (mode === 'single') return singleDate ? [singleDate] : []
    if (mode === 'range') return rangeStart && rangeEnd && rangeStart <= rangeEnd ? enumerateDateRange(rangeStart, rangeEnd) : []
    return multiDates
  }, [mode, singleDate, rangeStart, rangeEnd, multiDates])

  const dayReports = useMemo(() => {
    if (!hasGenerated || dateKeys.length === 0) return []
    return buildDayReports(
      dateKeys,
      allEntries,
      scopeHeaders,
      scopePoints,
      (path) => supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl
    )
  }, [hasGenerated, dateKeys, allEntries, scopeHeaders, scopePoints])

  function addMultiDate() {
    if (!multiInput) return
    setMultiDates((prev) => (prev.includes(multiInput) ? prev : [...prev, multiInput].sort()))
    setMultiInput('')
  }

  function removeMultiDate(date: string) {
    setMultiDates((prev) => prev.filter((d) => d !== date))
  }

  async function handleGenerate() {
    if (!propertyId) return
    setLoading(true)
    setHasGenerated(true)
    setGenerateError(null)
    const [entriesRes, headersRes, pointsRes] = await Promise.all([
      supabase.from('entries').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }),
      supabase.from('scope_headers').select('*').eq('property_id', propertyId).order('position'),
      supabase.from('scope_points').select('*').eq('property_id', propertyId).order('position'),
    ])
    const firstError = entriesRes.error ?? headersRes.error ?? pointsRes.error
    if (firstError) {
      setGenerateError(firstError.message)
      setLoading(false)
      return
    }
    setAllEntries(entriesRes.data ?? [])
    setScopeHeaders(headersRes.data ?? [])
    setScopePoints(pointsRes.data ?? [])
    setGeneratedAt(new Date())
    setLoading(false)
  }

  function dateSummary() {
    if (mode === 'single') return singleDate ? `Date: ${singleDate}` : 'No date selected'
    if (mode === 'range') return rangeStart && rangeEnd ? `From ${rangeStart} to ${rangeEnd}` : 'No range selected'
    return multiDates.length ? `Dates: ${multiDates.join(', ')}` : 'No dates selected'
  }

  const generatedByName = profile?.display_name ?? 'Unknown'

  async function handleExportPdf() {
    if (!selectedProperty || !generatedAt) return
    setExporting(true)
    try {
      await exportReportToPdf(selectedProperty, dayReports, generatedByName, generatedAt)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="page">
      {propertyId && (
        <Link to={`/properties/${propertyId}`} className="back-link icon-link">
          <BackArrowIcon width={16} height={16} />
          Back to property
        </Link>
      )}
      <h1>Reports</h1>

      <div className="card report-filters">
        <label>
          Property
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mode-toggle">
          <button
            type="button"
            className={`btn btn-toggle ${mode === 'single' ? 'active' : ''}`}
            onClick={() => setMode('single')}
          >
            Single day
          </button>
          <button
            type="button"
            className={`btn btn-toggle ${mode === 'range' ? 'active' : ''}`}
            onClick={() => setMode('range')}
          >
            Date range
          </button>
          <button
            type="button"
            className={`btn btn-toggle ${mode === 'multiple' ? 'active' : ''}`}
            onClick={() => setMode('multiple')}
          >
            Multiple days
          </button>
        </div>

        {mode === 'single' && (
          <label>
            Date
            <input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} />
          </label>
        )}

        {mode === 'range' && (
          <div className="range-inputs">
            <label>
              Start
              <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
            </label>
            <label>
              End
              <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
            </label>
          </div>
        )}

        {mode === 'multiple' && (
          <div className="multi-date-picker">
            <label>
              Add date
              <div className="multi-date-row">
                <input type="date" value={multiInput} onChange={(e) => setMultiInput(e.target.value)} />
                <button type="button" className="btn btn-ghost" onClick={addMultiDate}>
                  Add
                </button>
              </div>
            </label>
            {multiDates.length > 0 && (
              <div className="date-chips">
                {multiDates.map((d) => (
                  <span key={d} className="date-chip">
                    {d}
                    <button type="button" onClick={() => removeMultiDate(d)} aria-label={`Remove ${d}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <button className="btn btn-primary" onClick={handleGenerate} disabled={!propertyId || loading}>
          {loading ? 'Generating…' : 'Generate report'}
        </button>
        {generateError && <p className="form-error">{generateError}</p>}
      </div>

      {hasGenerated && !generateError && (
        <div className="report-results">
          <div className="page-header">
            <div>
              <h2>{selectedProperty?.name}</h2>
              <p className="property-description">{dateSummary()}</p>
              {generatedAt && (
                <p className="property-meta">
                  Generated {generatedAt.toLocaleString()} by {generatedByName}
                </p>
              )}
            </div>
            <button
              className="btn btn-primary btn-icon"
              onClick={handleExportPdf}
              disabled={exporting || dayReports.length === 0}
            >
              <DownloadIcon width={16} height={16} />
              {exporting ? 'Exporting…' : 'Export as PDF'}
            </button>
          </div>

          {dayReports.length === 0 ? (
            <p className="empty-state">No days found for the selected date(s).</p>
          ) : (
            <div className="report-days">
              {dayReports.map((day) => {
                const isEmpty =
                  day.checklistSections.length === 0 && day.photoUrls.length === 0 && day.notes.length === 0
                return (
                  <div key={day.dateKey} className="card report-day-card">
                    <h3>{day.dateLabel}</h3>
                    <ProgressBar percent={day.progressPercent} />

                    {day.checklistSections.length > 0 && (
                      <div className="report-checklist-sections">
                        {day.checklistSections.map((section) => (
                          <details key={section.headerId} className="scope-header">
                            <summary>
                              <span className="scope-header-title">{section.headerTitle}</span>
                              <span className="scope-header-weight">
                                {section.points.length} completed
                              </span>
                            </summary>
                            <ul className="scope-points">
                              {section.points.map((point) => (
                                <li key={point.id} className="scope-point">
                                  <span className="scope-point-title checked">{point.title}</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ))}
                      </div>
                    )}

                    {day.photoUrls.length > 0 && (
                      <div className="report-day-photos">
                        <Carousel photos={day.photoUrls} />
                      </div>
                    )}

                    {day.notes.length > 0 && (
                      <div className="report-day-notes">
                        <h4 className="report-section-heading">Notes added by team</h4>
                        {day.notes.map((note) => (
                          <div key={note.entryId} className="report-note">
                            <p className="timeline-meta">
                              <strong>{note.uploaderName}</strong> · {formatTimestamp(note.createdAt)}
                            </p>
                            <p className="timeline-note">{note.note}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {isEmpty && <p className="empty-state">No new activity recorded this day.</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

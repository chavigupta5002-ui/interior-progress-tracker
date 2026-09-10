import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, PHOTOS_BUCKET } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Entry, Property, ScopeHeader, ScopePoint } from '../types'
import { Carousel } from '../components/Carousel'
import { ProgressBar } from '../components/ProgressBar'
import { exportReportToPdf } from '../lib/pdf'
import { buildDayReports, enumerateDateRange } from '../lib/reportDays'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'

type DateMode = 'single' | 'range' | 'multiple'

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  const datePart = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${datePart}, ${timePart}`
}

const inputClass =
  'h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:ring-4 focus:ring-yellow-100 focus:outline-none'

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

  const modeOptions: { value: DateMode; label: string }[] = [
    { value: 'single', label: 'Single day' },
    { value: 'range', label: 'Date range' },
    { value: 'multiple', label: 'Multiple days' },
  ]

  return (
    <div>
      {propertyId && (
        <Link
          to={`/properties/${propertyId}`}
          className="mb-5 flex items-center text-xs font-medium text-gray-500 hover:text-gray-800"
        >
          <ChevronLeft className="mr-1" size={16} />
          Back to property
        </Link>
      )}
      <h1 className="mb-5 text-3xl font-bold text-gray-900">Reports</h1>

      <div className="mb-5 flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Property
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className={inputClass}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex rounded-full bg-gray-100 p-1">
          {modeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold transition-colors ${
                mode === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode === 'single' && (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
            Date
            <input
              type="date"
              value={singleDate}
              onChange={(e) => setSingleDate(e.target.value)}
              className={inputClass}
            />
          </label>
        )}

        {mode === 'range' && (
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-gray-700">
              Start
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-gray-700">
              End
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        )}

        {mode === 'multiple' && (
          <div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              Add date
              <div className="flex gap-2">
                <input
                  type="date"
                  value={multiInput}
                  onChange={(e) => setMultiInput(e.target.value)}
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  onClick={addMultiDate}
                >
                  Add
                </button>
              </div>
            </label>
            {multiDates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {multiDates.map((d) => (
                  <span
                    key={d}
                    className="flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pr-1.5 pl-3 text-xs font-medium text-gray-700"
                  >
                    {d}
                    <button
                      type="button"
                      onClick={() => removeMultiDate(d)}
                      aria-label={`Remove ${d}`}
                      className="flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:text-gray-700"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          className="rounded-xl bg-[#FFD700] py-3 text-sm font-semibold text-black shadow-sm transition-all hover:bg-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleGenerate}
          disabled={!propertyId || loading}
        >
          {loading ? 'Generating…' : 'Generate report'}
        </button>
        {generateError && <p className="text-sm text-red-600">{generateError}</p>}
      </div>

      {hasGenerated && !generateError && (
        <div>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{selectedProperty?.name}</h2>
              <p className="text-sm text-gray-600">{dateSummary()}</p>
              {generatedAt && (
                <p className="mt-1 text-xs text-gray-400">
                  Generated {generatedAt.toLocaleString()} by {generatedByName}
                </p>
              )}
            </div>
            <button
              className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-[#FFD700] px-3 py-2.5 text-xs font-semibold text-black shadow-sm hover:bg-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleExportPdf}
              disabled={exporting || dayReports.length === 0}
            >
              <Download size={16} />
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>

          {dayReports.length === 0 ? (
            <p className="py-6 text-sm text-gray-500">No days found for the selected date(s).</p>
          ) : (
            <div className="flex flex-col gap-4">
              {dayReports.map((day) => {
                const isEmpty =
                  day.checklistSections.length === 0 && day.photoUrls.length === 0 && day.notes.length === 0
                return (
                  <div
                    key={day.dateKey}
                    className="rounded-xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]"
                  >
                    <h3 className="mb-3 text-base font-semibold text-gray-900">{day.dateLabel}</h3>
                    <ProgressBar percent={day.progressPercent} />

                    {day.checklistSections.length > 0 && (
                      <div className="mt-4 flex flex-col gap-2">
                        {day.checklistSections.map((section) => (
                          <details key={section.headerId} className="group rounded-lg border border-gray-100 p-3">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <ChevronRight
                                  className="text-gray-400 transition-transform group-open:rotate-90"
                                  size={14}
                                />
                                <span className="text-sm font-semibold text-gray-900">{section.headerTitle}</span>
                              </div>
                              <span className="text-[11px] font-medium text-gray-500">
                                {section.points.length} completed
                              </span>
                            </summary>
                            <ul className="mt-2 flex flex-col gap-1 pl-6">
                              {section.points.map((point) => (
                                <li key={point.id} className="text-sm text-gray-700">
                                  {point.title}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ))}
                      </div>
                    )}

                    {day.photoUrls.length > 0 && (
                      <div className="mt-4">
                        <Carousel photos={day.photoUrls} />
                      </div>
                    )}

                    {day.notes.length > 0 && (
                      <div className="mt-4 flex flex-col gap-3">
                        <h4 className="text-sm font-semibold text-gray-500">Notes added by team</h4>
                        {day.notes.map((note) => (
                          <div key={note.entryId} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                            <p className="text-xs text-gray-400">
                              <span className="font-medium text-gray-600">{note.uploaderName}</span> ·{' '}
                              {formatTimestamp(note.createdAt)}
                            </p>
                            <p className="mt-1 text-sm whitespace-pre-wrap text-gray-800">{note.note}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {isEmpty && <p className="mt-4 text-sm text-gray-500">No new activity recorded this day.</p>}
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

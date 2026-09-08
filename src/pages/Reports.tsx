import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Entry, Property } from '../types'
import { TimelineEntry } from '../components/TimelineEntry'
import { exportEntriesToPdf } from '../lib/pdf'
import { DownloadIcon } from '../components/Icon'

type DateMode = 'single' | 'range' | 'multiple'

function toDateKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function Reports() {
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
  const [loading, setLoading] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [exporting, setExporting] = useState(false)

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

  const filteredEntries = useMemo(() => {
    if (!hasGenerated) return []
    if (mode === 'single') {
      if (!singleDate) return []
      return allEntries.filter((e) => toDateKey(e.created_at) === singleDate)
    }
    if (mode === 'range') {
      if (!rangeStart || !rangeEnd) return []
      return allEntries.filter((e) => {
        const key = toDateKey(e.created_at)
        return key >= rangeStart && key <= rangeEnd
      })
    }
    if (multiDates.length === 0) return []
    const set = new Set(multiDates)
    return allEntries.filter((e) => set.has(toDateKey(e.created_at)))
  }, [hasGenerated, mode, singleDate, rangeStart, rangeEnd, multiDates, allEntries])

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
    const { data } = await supabase
      .from('entries')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
    setAllEntries(data ?? [])
    setLoading(false)
  }

  function dateLabel() {
    if (mode === 'single') return singleDate ? `Date: ${singleDate}` : 'No date selected'
    if (mode === 'range') return rangeStart && rangeEnd ? `From ${rangeStart} to ${rangeEnd}` : 'No range selected'
    return multiDates.length ? `Dates: ${multiDates.join(', ')}` : 'No dates selected'
  }

  async function handleExportPdf() {
    if (!selectedProperty) return
    setExporting(true)
    try {
      await exportEntriesToPdf(selectedProperty, filteredEntries, dateLabel())
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="page">
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
      </div>

      {hasGenerated && (
        <div className="report-results">
          <div className="page-header">
            <div>
              <h2>{selectedProperty?.name}</h2>
              <p className="property-description">{dateLabel()}</p>
            </div>
            <button
              className="btn btn-primary btn-icon"
              onClick={handleExportPdf}
              disabled={exporting || filteredEntries.length === 0}
            >
              <DownloadIcon width={16} height={16} />
              {exporting ? 'Exporting…' : 'Export as PDF'}
            </button>
          </div>

          {filteredEntries.length === 0 ? (
            <p className="empty-state">No entries found for the selected date(s).</p>
          ) : (
            <div className="timeline">
              {filteredEntries.map((entry) => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  onUpdated={(updated) =>
                    setAllEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
                  }
                  onDeleted={(id) => setAllEntries((prev) => prev.filter((e) => e.id !== id))}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

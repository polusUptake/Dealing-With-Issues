import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import './App.css'

type ReportStatus = 'pending' | 'synced'

type ReportRecord = {
  id: string
  title: string
  images: string[]
  imageUrls: string[]
  location: {
    lat: number
    lng: number
  }
  createdAt: number
  syncStatus: ReportStatus
}

type BackendReportRecord = Omit<ReportRecord, 'images' | 'syncStatus'>

const LOCAL_STORAGE_KEY = 'disaster-reports-v1'
const DESKTOP_BREAKPOINT = 920
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? ''
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787'

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN
}

function loadLocalReports(): ReportRecord[] {
  try {
    const rawValue = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((report) => {
      if (!report || typeof report !== 'object') {
        return false
      }

      const candidate = report as Partial<ReportRecord>
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.title === 'string' &&
        typeof candidate.createdAt === 'number' &&
        typeof candidate.location?.lat === 'number' &&
        typeof candidate.location?.lng === 'number'
      )
    }) as ReportRecord[]
  } catch {
    return []
  }
}

function saveLocalReports(reports: ReportRecord[]) {
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reports))
}

function toDataUrls(fileList: FileList): Promise<string[]> {
  const files = Array.from(fileList)
  return Promise.all(
    files.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result ?? ''))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        }),
    ),
  )
}

function mergeReports(
  localReports: ReportRecord[],
  remoteReports: ReportRecord[],
): ReportRecord[] {
  const merged = new Map<string, ReportRecord>()
  for (const report of localReports) {
    merged.set(report.id, report)
  }

  for (const report of remoteReports) {
    const existing = merged.get(report.id)
    if (!existing || existing.syncStatus === 'pending') {
      merged.set(report.id, report)
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt)
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth < DESKTOP_BREAKPOINT,
  )

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < DESKTOP_BREAKPOINT)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}

function App() {
  const [reports, setReports] = useState<ReportRecord[]>(() => loadLocalReports())
  const reportsRef = useRef(reports)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [backendStatus, setBackendStatus] = useState<'unknown' | 'ready' | 'offline'>(
    'unknown',
  )
  const [title, setTitle] = useState('')
  const [imageDataUrls, setImageDataUrls] = useState<string[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  )
  const [activeMobilePanel, setActiveMobilePanel] = useState<
    'report' | 'map' | 'analytics'
  >('report')

  const isMobile = useIsMobile()
  const shouldRenderMap = !isMobile || activeMobilePanel === 'map'

  useEffect(() => {
    reportsRef.current = reports
    saveLocalReports(reports)
  }, [reports])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!mapContainerRef.current || !MAPBOX_TOKEN || !shouldRenderMap) {
      return
    }

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [0, 20],
      zoom: 1.6,
      attributionControl: true,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    mapRef.current = map

    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [shouldRenderMap])

  useEffect(() => {
    if (!mapRef.current) {
      return
    }

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    for (const report of reports) {
      const markerElement = document.createElement('button')
      markerElement.className =
        report.syncStatus === 'pending' ? 'report-marker pending' : 'report-marker'
      markerElement.type = 'button'
      markerElement.title = report.title

      const marker = new mapboxgl.Marker({ element: markerElement })
        .setLngLat([report.location.lng, report.location.lat])
        .setPopup(
          new mapboxgl.Popup({ closeButton: false, offset: 12 }).setHTML(
            `<h4>${report.title}</h4><p>${new Date(report.createdAt).toLocaleString()}</p>`,
          ),
        )
        .addTo(mapRef.current)

      markersRef.current.push(marker)
    }
  }, [reports])

  async function fetchRemoteReports() {
    if (!navigator.onLine) {
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/reports`)
      if (!response.ok) {
        setBackendStatus('offline')
        return
      }

      setBackendStatus('ready')

      const payload = (await response.json()) as { reports?: BackendReportRecord[] }
      const remoteReports = Array.isArray(payload.reports) ? payload.reports : []

      const mappedReports = remoteReports.map((report) => ({
        id: report.id,
        title: report.title,
        images: [],
        imageUrls: report.imageUrls,
        location: report.location,
        createdAt: report.createdAt,
        syncStatus: 'synced' as const,
      }))

      setReports((current) => mergeReports(current, mappedReports))
    } catch {
      setBackendStatus('offline')
      setSyncError('Could not fetch latest reports from backend.')
    }
  }

  async function syncPendingReports(candidateReports?: ReportRecord[]) {
    const sourceReports = candidateReports ?? reportsRef.current
    const pendingReports = sourceReports.filter(
      (report) => report.syncStatus === 'pending',
    )

    if (pendingReports.length === 0 || !navigator.onLine) {
      return
    }

    setIsSyncing(true)
    setSyncError(null)
    const syncedPayloadById = new Map<string, BackendReportRecord>()
    const syncedIds = new Set<string>()

    for (const report of pendingReports) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/reports`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: report.id,
            title: report.title,
            images: report.images,
            location: report.location,
            createdAt: report.createdAt,
          }),
        })

        if (!response.ok) {
          setBackendStatus('offline')
          throw new Error('Failed to sync report')
        }

        setBackendStatus('ready')

        const payload = (await response.json()) as { report?: BackendReportRecord }
        if (payload.report) {
          syncedPayloadById.set(report.id, payload.report)
        }

        syncedIds.add(report.id)
      } catch {
        setSyncError('Some offline reports are still pending sync. Retrying...')
      }
    }

    if (syncedIds.size > 0) {
      setReports((current) =>
        current.map((report) => {
          if (!syncedIds.has(report.id)) {
            return report
          }

          return {
            ...report,
            syncStatus: 'synced',
            imageUrls:
              syncedPayloadById.get(report.id)?.imageUrls ?? report.imageUrls,
          }
        }),
      )
    }

    setIsSyncing(false)
  }

  useEffect(() => {
    if (!isOnline) {
      return
    }

    const kickoffHandle = window.setTimeout(() => {
      void syncPendingReports()
      void fetchRemoteReports()
    }, 0)

    return () => window.clearTimeout(kickoffHandle)
  }, [isOnline])

  useEffect(() => {
    if (!isOnline) {
      return
    }

    const retryHandle = window.setInterval(() => {
      void syncPendingReports()
    }, 15000)

    return () => window.clearInterval(retryHandle)
  }, [isOnline])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setFormError('A report title is required.')
      return
    }

    if (!location) {
      setFormError('Capture your location before submitting a report.')
      return
    }

    const nextReport: ReportRecord = {
      id: crypto.randomUUID(),
      title: trimmedTitle,
      images: imageDataUrls,
      imageUrls: [],
      location,
      createdAt: Date.now(),
      syncStatus: 'pending',
    }

    const nextReports = [nextReport, ...reportsRef.current]
    reportsRef.current = nextReports
    setReports(nextReports)
    setTitle('')
    setImageDataUrls([])
    setLocation(null)

    if (isOnline) {
      void syncPendingReports(nextReports)
    }
  }

  function handleLocateUser() {
    setFormError(null)
    if (!navigator.geolocation) {
      setFormError('Geolocation is not supported on this device.')
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false)
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })

        if (mapRef.current) {
          mapRef.current.flyTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: 12,
            essential: true,
          })
        }
      },
      () => {
        setIsLocating(false)
        setFormError('Unable to access current location.')
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  const analytics = useMemo(() => {
    const total = reports.length
    const pending = reports.filter((report) => report.syncStatus === 'pending').length
    const synced = total - pending
    const latest = reports[0]

    return { total, pending, synced, latest }
  }, [reports])

  const statusLabel = isOnline ? 'Online' : 'Offline'

  const reportForm = (
    <form className="report-form" onSubmit={handleSubmit}>
      <h2>Report Incident</h2>
      <label htmlFor="report-title">Title</label>
      <input
        id="report-title"
        type="text"
        placeholder="Bridge collapse near River Road"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />

      <label htmlFor="report-images">Add pictures</label>
      <input
        id="report-images"
        type="file"
        accept="image/*"
        multiple
        onChange={async (event) => {
          const files = event.target.files
          if (!files || files.length === 0) {
            setImageDataUrls([])
            return
          }

          const dataUrls = await toDataUrls(files)
          setImageDataUrls(dataUrls)
        }}
      />
      <p className="helper-text">{imageDataUrls.length} image(s) attached</p>

      <button
        type="button"
        className="secondary"
        onClick={handleLocateUser}
        disabled={isLocating}
      >
        {isLocating ? 'Capturing location...' : 'Use my location'}
      </button>

      <p className="helper-text">
        {location
          ? `Lat ${location.lat.toFixed(4)}, Lng ${location.lng.toFixed(4)}`
          : 'Location not captured'}
      </p>

      {formError ? <p className="error">{formError}</p> : null}

      <button type="submit" className="primary">
        Submit report
      </button>
    </form>
  )

  const analyticsPanel = (
    <section className="analytics-panel">
      <h2>Incident Analytics</h2>
      <div className="stats-grid">
        <article>
          <span>Total</span>
          <strong>{analytics.total}</strong>
        </article>
        <article>
          <span>Synced</span>
          <strong>{analytics.synced}</strong>
        </article>
        <article>
          <span>Pending</span>
          <strong>{analytics.pending}</strong>
        </article>
      </div>

      <h3>Latest incident</h3>
      {analytics.latest ? (
        <div className="latest-incident">
          <strong>{analytics.latest.title}</strong>
          <p>{new Date(analytics.latest.createdAt).toLocaleString()}</p>
        </div>
      ) : (
        <p className="helper-text">No incidents submitted yet.</p>
      )}

      <h3>Recent reports</h3>
      <ul className="incident-list">
        {reports.slice(0, 8).map((report) => (
          <li key={report.id}>
            <span>{report.title}</span>
            <small>{report.syncStatus}</small>
          </li>
        ))}
      </ul>
    </section>
  )

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Disaster Response</h1>
          <p>Offline-first reporting with synchronized incident visibility.</p>
        </div>
        <div className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
          <span>{statusLabel}</span>
          <small>
            {isSyncing ? 'Syncing reports...' : `${analytics.pending} pending report(s)`}
          </small>
        </div>
      </header>

      {backendStatus === 'offline' ? (
        <p className="banner warning">
          Backend is unreachable. Reports will stay queued locally until connection is restored.
        </p>
      ) : null}

      {syncError ? <p className="banner error">{syncError}</p> : null}

      {isMobile ? (
        <section className="mobile-panels">
          <nav className="mobile-nav" aria-label="Mobile panel switcher">
            <button
              type="button"
              className={activeMobilePanel === 'report' ? 'active' : ''}
              onClick={() => setActiveMobilePanel('report')}
            >
              Report
            </button>
            <button
              type="button"
              className={activeMobilePanel === 'map' ? 'active' : ''}
              onClick={() => setActiveMobilePanel('map')}
            >
              Map
            </button>
            <button
              type="button"
              className={activeMobilePanel === 'analytics' ? 'active' : ''}
              onClick={() => setActiveMobilePanel('analytics')}
            >
              Analytics
            </button>
          </nav>

          {activeMobilePanel === 'report' ? (
            <aside className="mobile-card">{reportForm}</aside>
          ) : null}

          {activeMobilePanel === 'map' ? (
            <section className="mobile-map">
              <div ref={mapContainerRef} className="map-canvas" />
              {!MAPBOX_TOKEN ? (
                <div className="map-overlay-message">
                  Add VITE_MAPBOX_ACCESS_TOKEN to render the map.
                </div>
              ) : null}
            </section>
          ) : null}

          {activeMobilePanel === 'analytics' ? (
            <aside className="mobile-card">{analyticsPanel}</aside>
          ) : null}
        </section>
      ) : (
        <section className="desktop-stage">
          <div ref={mapContainerRef} className="map-canvas" />
          {!MAPBOX_TOKEN ? (
            <div className="map-overlay-message">
              Add VITE_MAPBOX_ACCESS_TOKEN to render the map.
            </div>
          ) : null}

          <aside className={`sidebar left ${leftCollapsed ? 'collapsed' : ''}`}>
            <button
              type="button"
              className="collapse-toggle"
              aria-label={leftCollapsed ? 'Expand report panel' : 'Collapse report panel'}
              title={leftCollapsed ? 'Expand report panel' : 'Collapse report panel'}
              onClick={() => setLeftCollapsed((current) => !current)}
            >
              {leftCollapsed ? '>' : '<'}
            </button>
            <div className="sidebar-content">{reportForm}</div>
          </aside>

          <aside className={`sidebar right ${rightCollapsed ? 'collapsed' : ''}`}>
            <button
              type="button"
              className="collapse-toggle"
              aria-label={rightCollapsed ? 'Expand analytics panel' : 'Collapse analytics panel'}
              title={rightCollapsed ? 'Expand analytics panel' : 'Collapse analytics panel'}
              onClick={() => setRightCollapsed((current) => !current)}
            >
              {rightCollapsed ? '<' : '>'}
            </button>
            <div className="sidebar-content">{analyticsPanel}</div>
          </aside>
        </section>
      )}
    </main>
  )
}

export default App

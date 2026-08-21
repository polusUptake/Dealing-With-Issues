import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ThumbsUp, ThumbsDown, Camera, Clock, MapPin } from 'lucide-react'
import './App.css'
import VerificationPanel from './components/recaptcha_cloudflare'
import AnalyticsPanel from './components/AnalyticsPanel'

function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371 // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

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
  turnstileToken?: string
  upvotes?: number
  downvotes?: number
  isRemote?: boolean
}

type BackendReportRecord = Omit<ReportRecord, 'images' | 'syncStatus'> & {
  ticketId?: string
  description?: string
  media?: { url: string; public_id: string }
  timestamp?: string
}

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
    }).map((report) => {
      const candidate = report as Partial<ReportRecord>
      return {
        id: candidate.id!,
        title: candidate.title!,
        images: Array.isArray(candidate.images) ? candidate.images : [],
        imageUrls: Array.isArray(candidate.imageUrls) ? candidate.imageUrls : [],
        location: candidate.location!,
        createdAt: candidate.createdAt!,
        syncStatus: candidate.syncStatus === 'pending' ? 'pending' : 'synced',
        turnstileToken: candidate.turnstileToken,
        upvotes: typeof candidate.upvotes === 'number' ? candidate.upvotes : 0,
        downvotes: typeof candidate.downvotes === 'number' ? candidate.downvotes : 0,
        isRemote: typeof candidate.isRemote === 'boolean' ? candidate.isRemote : false,
      } as ReportRecord
    })
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



function getTransformedThumb(url?: string): string {
  if (!url) return ''
  if (url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/c_thumb,w_100,h_100,g_auto/')
  }
  return url
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
    if (!existing) {
      merged.set(report.id, report)
    } else {
      merged.set(report.id, {
        ...existing,
        title: report.title,
        imageUrls: report.imageUrls.length > 0 ? report.imageUrls : existing.imageUrls,
        location: report.location,
        upvotes: typeof report.upvotes === 'number' ? report.upvotes : (existing.upvotes || 0),
        downvotes: typeof report.downvotes === 'number' ? report.downvotes : (existing.downvotes || 0),
      })
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
  const selectedMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const resetTimerRef = useRef<number | null>(null)

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
  const [isPickingOnMap, setIsPickingOnMap] = useState(false)
  const isPickingOnMapRef = useRef(isPickingOnMap)
  isPickingOnMapRef.current = isPickingOnMap

  const [submittedStatus, setSubmittedStatus] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  )
  const [locationMode, setLocationMode] = useState<'gps' | 'pin' | null>(null)
  const locationModeRef = useRef(locationMode)
  locationModeRef.current = locationMode

  const [isRemote, setIsRemote] = useState<boolean>(false)
  const [draftPin, setDraftPin] = useState<{ lat: number; lng: number } | null>(null)
  const [is3DMode, setIs3DMode] = useState<boolean>(false)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [activeMobilePanel, setActiveMobilePanel] = useState<
    'report' | 'map' | 'analytics'
  >('report')

  const isMobile = useIsMobile()
  const shouldRenderMap = !isMobile || activeMobilePanel === 'map'

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

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

    const init3DLayers = () => {
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        })
      }

      if (!map.getLayer('3d-buildings')) {
        const layers = map.getStyle()?.layers
        const labelLayerId = layers?.find(
          (layer) => layer.type === 'symbol' && layer.layout?.['text-field'],
        )?.id

        map.addLayer(
          {
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', 'extrude', 'true'],
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': '#aaa',
              'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15,
                0,
                15.05,
                ['get', 'height'],
              ],
              'fill-extrusion-base': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15,
                0,
                15.05,
                ['get', 'min_height'],
              ],
              'fill-extrusion-opacity': 0.6,
            },
            layout: {
              visibility: 'none',
            },
          },
          labelLayerId,
        )
      }
    }

    if (map.isStyleLoaded()) {
      init3DLayers()
    } else {
      map.on('style.load', init3DLayers)
    }

    map.on('click', (event) => {
      if (!isPickingOnMapRef.current && locationModeRef.current !== 'pin') {
        return
      }
      const { lng, lat } = event.lngLat
      setLocation({ lat, lng })
      setDraftPin({ lat, lng })
      setIsPickingOnMap(false)
      setFormError(null)
    })

    mapRef.current = map

    return () => {
      if (selectedMarkerRef.current) {
        selectedMarkerRef.current.remove()
        selectedMarkerRef.current = null
      }
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [shouldRenderMap])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    // Context preservation
    const currentCenter = map.getCenter()
    const currentZoom = map.getZoom()
    const currentBearing = map.getBearing()

    if (is3DMode) {
      // 3D Mode Activation
      map.easeTo({
        pitch: 60,
        center: currentCenter,
        zoom: currentZoom,
        bearing: currentBearing,
        duration: 1000,
      })
      try {
        if (map.getSource('mapbox-dem')) {
          map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
        }
      } catch (err) {
        console.warn('Failed to enable 3D terrain:', err)
      }
      if (map.getLayer('3d-buildings')) {
        map.setLayoutProperty('3d-buildings', 'visibility', 'visible')
      }
    } else {
      // 2D Mode Activation
      map.easeTo({
        pitch: 0,
        center: currentCenter,
        zoom: currentZoom,
        bearing: currentBearing,
        duration: 1000,
      })
      try {
        map.setTerrain(null)
      } catch (err) {
        console.warn('Failed to disable 3D terrain:', err)
      }
      if (map.getLayer('3d-buildings')) {
        map.setLayoutProperty('3d-buildings', 'visibility', 'none')
      }
    }
  }, [is3DMode])

  useEffect(() => {
    if (!mapRef.current) {
      return
    }
    mapRef.current.getCanvas().style.cursor = isPickingOnMap ? 'crosshair' : ''
  }, [isPickingOnMap])

  useEffect(() => {
    if (!mapRef.current) {
      return
    }

    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.remove()
      selectedMarkerRef.current = null
    }

    if (location) {
      const el = document.createElement('div')
      el.className = 'report-marker selected'
      el.title = `Selected: Lat ${location.lat.toFixed(4)}, Lng ${location.lng.toFixed(4)}`

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([location.lng, location.lat])
        .setPopup(
          new mapboxgl.Popup({ closeButton: false, offset: 12 }).setHTML(
            `<h4>Selected Disaster Location</h4><p>Lat: ${location.lat.toFixed(4)}, Lng: ${location.lng.toFixed(4)}</p>`,
          ),
        )
        .addTo(mapRef.current)

      selectedMarkerRef.current = marker
    }
  }, [location])

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

      const payload = (await response.json()) as {
        tickets?: BackendReportRecord[]
        reports?: BackendReportRecord[]
      }
      const rawReports = payload.tickets || payload.reports || []
      const remoteReports = Array.isArray(rawReports) ? rawReports : []

      const mappedReports = remoteReports.map((report) => ({
        id: report.ticketId || report.id,
        title: report.title || report.description || 'Incident',
        images: [],
        imageUrls: report.media?.url ? [report.media.url] : (Array.isArray(report.imageUrls) ? report.imageUrls : []),
        location: {
          lat: report.location?.lat ?? (report.location as any)?.latitude ?? 0,
          lng: report.location?.lng ?? (report.location as any)?.longitude ?? 0,
        },
        createdAt: typeof report.createdAt === 'number' ? report.createdAt : (report.timestamp ? new Date(report.timestamp).getTime() : Date.now()),
        syncStatus: 'synced' as const,
        upvotes: typeof report.upvotes === 'number' ? report.upvotes : 0,
        downvotes: typeof report.downvotes === 'number' ? report.downvotes : 0,
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
            turnstileToken: report.turnstileToken,
            'cf-turnstile-response': report.turnstileToken,
            isRemote: report.isRemote || false,
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
      setFormError('Capture or pick a location before submitting a report.')
      return
    }

    if (import.meta.env.VITE_CLOUDFLARE_SITE_KEY && !turnstileToken) {
      setFormError('Please complete the security verification before submitting.')
      return
    }

    const nextReport: ReportRecord = {
      id: crypto.randomUUID(),
      title: trimmedTitle,
      images: locationMode === 'pin' ? [] : imageDataUrls,
      imageUrls: [],
      location,
      createdAt: Date.now(),
      syncStatus: 'pending',
      turnstileToken: turnstileToken || undefined,
      isRemote: locationMode === 'pin' ? isRemote : false,
    }

    const nextReports = [nextReport, ...reportsRef.current]
    reportsRef.current = nextReports
    setReports(nextReports)
    setTitle('')
    setImageDataUrls([])
    setLocation(null)
    setDraftPin(null)
    setLocationMode(null)
    setIsRemote(false)
    setIsPickingOnMap(false)
    setTurnstileToken(null)

    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.remove()
      selectedMarkerRef.current = null
    }

    setSubmittedStatus(true)
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current)
    }
    resetTimerRef.current = window.setTimeout(() => {
      setSubmittedStatus(false)
    }, 5000)

    if (isOnline) {
      void syncPendingReports(nextReports)
    }
  }

  function handleLocateUser() {
    setFormError(null)
    setIsPickingOnMap(false)
    if (!navigator.geolocation) {
      setFormError('Geolocation is not supported on this device.')
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false)
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        setLocation(coords)

        if (mapRef.current) {
          mapRef.current.flyTo({
            center: [coords.lng, coords.lat],
            zoom: 13,
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

  const nearbyRankedReports = useMemo(() => {
    // 1. If location is null: return empty array
    if (!location) {
      return []
    }

    // 2. Filter within 15 km radius and sort descending by upvotes
    return reports
      .map((report) => {
        const hasCoords =
          typeof report.location?.lat === 'number' && typeof report.location?.lng === 'number'
        const distKm = hasCoords
          ? calculateDistanceKm(
              location.lat,
              location.lng,
              report.location.lat,
              report.location.lng,
            )
          : Infinity

        return { ...report, distanceKm: distKm }
      })
      .filter((item) => item.distanceKm <= 15.0)
      .sort((a, b) => {
        const upA = a.upvotes || 0
        const upB = b.upvotes || 0
        if (upB !== upA) {
          return upB - upA
        }
        return b.createdAt - a.createdAt
      })
  }, [location, reports])

  const selectedReport = useMemo(() => {
    if (!selectedReportId) return null
    return reports.find((r) => r.id === selectedReportId) || null
  }, [reports, selectedReportId])

  const similarReports = useMemo(() => {
    if (!location) {
      return []
    }

    const trimmed = title.trim().toLowerCase()
    const words = trimmed
      ? trimmed
          .split(/\s+/)
          .map((w) => w.replace(/[^a-z0-9]/gi, ''))
          .filter((w) => w.length > 3)
      : []

    return reports
      .map((report) => {
        const hasCoords =
          typeof report.location?.lat === 'number' && typeof report.location?.lng === 'number'
        const distKm = hasCoords
          ? calculateDistanceKm(
              location.lat,
              location.lng,
              report.location.lat,
              report.location.lng,
            )
          : Infinity

        return { ...report, distanceKm: distKm }
      })
      .filter((item) => {
        if (item.distanceKm > 15.0) return false
        if (words.length > 0) {
          const reportTitle = (item.title || '').toLowerCase()
          return words.some((word) => reportTitle.includes(word))
        }
        return true
      })
      .sort((a, b) => {
        const upA = a.upvotes || 0
        const upB = b.upvotes || 0
        if (upB !== upA) return upB - upA
        return a.distanceKm - b.distanceKm
      })
      .slice(0, 5)
  }, [title, location, reports])

  async function handleVote(reportId: string, action: 'upvote' | 'downvote') {
    // 1. Optimistic update in local state
    setReports((current) =>
      current.map((r) => {
        if (r.id !== reportId) return r
        const up = r.upvotes || 0
        const down = r.downvotes || 0
        return {
          ...r,
          upvotes: action === 'upvote' ? up + 1 : up,
          downvotes: action === 'downvote' ? down + 1 : down,
        }
      })
    )

    try {
      const response = await fetch(`${API_BASE_URL}/api/reports/${reportId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      })

      if (!response.ok) {
        throw new Error('Vote failed')
      }

      const data = (await response.json()) as {
        success?: boolean
        deleted?: boolean
        ticket?: { upvotes?: number; downvotes?: number }
      }

      if (data.deleted) {
        // Auto-deletion threshold reached: remove from state & map
        setReports((current) => current.filter((r) => r.id !== reportId))
        if (selectedReportId === reportId) {
          setSelectedReportId(null)
        }
      } else if (data.ticket) {
        setReports((current) =>
          current.map((r) =>
            r.id === reportId
              ? {
                  ...r,
                  upvotes: data.ticket?.upvotes ?? r.upvotes,
                  downvotes: data.ticket?.downvotes ?? r.downvotes,
                }
              : r
          )
        )
      }
    } catch (err) {
      console.error('Failed to submit vote:', err)
      // Rollback optimistic vote
      setReports((current) =>
        current.map((r) => {
          if (r.id !== reportId) return r
          const up = r.upvotes || 0
          const down = r.downvotes || 0
          return {
            ...r,
            upvotes: action === 'upvote' ? Math.max(0, up - 1) : up,
            downvotes: action === 'downvote' ? Math.max(0, down - 1) : down,
          }
        })
      )
    }
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
      <h2>Enter Report</h2>

      {/* 1. Location Capture Section at the very top */}
      <div className="location-prompt-box location-first-box">
        <p className="location-prompt-title">Location Mode</p>
        <div className="location-prompt-buttons">
          <button
            type="button"
            className={`location-opt-btn ${locationMode === 'gps' || (location && !isPickingOnMap && locationMode !== 'pin') ? 'selected' : ''}`}
            onClick={() => {
              setLocationMode('gps')
              setIsRemote(false)
              handleLocateUser()
            }}
            disabled={isLocating}
          >
            {isLocating ? 'Capturing GPS...' : 'Use my location'}
          </button>
          <button
            type="button"
            className={`location-opt-btn ${locationMode === 'pin' || isPickingOnMap ? 'active' : ''}`}
            onClick={() => {
              setLocationMode('pin')
              setIsPickingOnMap(true)
              setFormError(null)
              if (isMobile) {
                setActiveMobilePanel('map')
              }
            }}
          >
            {isPickingOnMap ? 'Clicking map...' : 'Drop pin'}
          </button>
        </div>

        {location ? (
          <div className="location-captured-badge">
            <span>
              Lat {(draftPin?.lat ?? location.lat).toFixed(4)}, Lng{' '}
              {(draftPin?.lng ?? location.lng).toFixed(4)}
              {locationMode === 'pin' ? ' (Pinned)' : ' (GPS)'}
            </span>
            <button
              type="button"
              className="clear-location-btn"
              onClick={() => {
                setLocation(null)
                setDraftPin(null)
                setLocationMode(null)
                setIsPickingOnMap(false)
                if (selectedMarkerRef.current) {
                  selectedMarkerRef.current.remove()
                  selectedMarkerRef.current = null
                }
              }}
              title="Clear location"
            >
              ✕
            </button>
          </div>
        ) : locationMode === 'pin' || isPickingOnMap ? (
          <p className="helper-text picking-highlight">Click anywhere on the map to set the incident location.</p>
        ) : (
          <p className="helper-text">Location not selected</p>
        )}
      </div>

      {/* 2. Title text input */}
      <label htmlFor="report-title">Title</label>
      <input
        id="report-title"
        type="text"
        placeholder="Bridge collapse near River Road"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />

      {/* 3. Add pictures file input & image count helper text (Disabled if locationMode === 'pin') */}
      <label
        htmlFor="report-images"
        className={locationMode === 'pin' ? 'disabled-label' : ''}
      >
        Add pictures {locationMode === 'pin' ? '(Disabled for Drop Pin)' : ''}
      </label>
      <input
        id="report-images"
        type="file"
        accept="image/*"
        multiple
        disabled={locationMode === 'pin'}
        className={locationMode === 'pin' ? 'input-disabled' : ''}
        onChange={async (event) => {
          if (locationMode === 'pin') return
          const files = event.target.files
          if (!files || files.length === 0) {
            setImageDataUrls([])
            return
          }

          const dataUrls = await toDataUrls(files)
          setImageDataUrls(dataUrls)
        }}
      />
      {locationMode === 'pin' ? (
        <p className="helper-text dimmed">Image upload is disabled for remote / drop-pin reports.</p>
      ) : (
        <p className="helper-text">{imageDataUrls.length} image(s) attached</p>
      )}

      {/* Checkbox for Remote / Secondhand reports (when locationMode === 'pin') */}
      {locationMode === 'pin' ? (
        <div className="remote-report-checkbox-group">
          <label className="remote-checkbox-label">
            <input
              type="checkbox"
              checked={isRemote}
              onChange={(e) => setIsRemote(e.target.checked)}
            />
            <span>Did you see this incident somewhere else? (e.g., Social Media, News)</span>
          </label>
        </div>
      ) : null}

      {formError ? <p className="error">{formError}</p> : null}

      <VerificationPanel
        onVerify={(token) => {
          setTurnstileToken(token)
          setFormError(null)
        }}
        onExpireOrError={() => setTurnstileToken(null)}
      />

      {/* 4. Submit report button */}
      <button type="submit" className="primary">
        Submit report
      </button>

      {/* Submission status textpanel */}
      <div
        className={`submit-status-panel ${submittedStatus ? 'submitted' : 'idle'}`}
        role="status"
        aria-live="polite"
      >
        {submittedStatus ? 'Submitted' : 'Report incident'}
      </div>

      {/* Similar / Nearby Reports Recommendation & Moderation */}
      {similarReports.length > 0 ? (
        <div className="similar-reports-section">
          <p className="similar-reports-heading">Nearby Existing Incidents</p>
          <div className="similar-reports-list">
            {similarReports.map((similar) => {
              const thumbUrl = similar.imageUrls?.[0] || similar.images?.[0]
              const transformedThumb = getTransformedThumb(thumbUrl)
              const distanceLabel =
                typeof (similar as any).distanceKm === 'number' &&
                isFinite((similar as any).distanceKm)
                  ? (similar as any).distanceKm < 1
                    ? `${Math.round((similar as any).distanceKm * 1000)} m away`
                    : `${(similar as any).distanceKm.toFixed(1)} km away`
                  : ''

              return (
                <div key={similar.id} className="similar-report-row">
                  {transformedThumb ? (
                    <img
                      src={transformedThumb}
                      alt={similar.title}
                      className="similar-report-thumb"
                    />
                  ) : (
                    <div className="similar-report-thumb-placeholder">📷</div>
                  )}

                  <div className="similar-report-info">
                    <span className="similar-report-title" title={similar.title}>
                      {similar.title}
                    </span>
                    <div className="similar-report-meta">
                      {distanceLabel ? (
                        <span className="similar-report-distance">{distanceLabel}</span>
                      ) : null}
                      <small className="similar-report-date">
                        {new Date(similar.createdAt).toLocaleDateString()}
                      </small>
                    </div>
                  </div>

                  <div className="similar-report-voting">
                    <button
                      type="button"
                      className="vote-btn upvote"
                      onClick={() => handleVote(similar.id, 'upvote')}
                      disabled={!location}
                      title={location ? 'Upvote this report' : 'Capture your location to vote'}
                      aria-label="Upvote"
                    >
                      <ThumbsUp size={13} /> {similar.upvotes || 0}
                    </button>

                    <button
                      type="button"
                      className="vote-btn downvote"
                      onClick={() => handleVote(similar.id, 'downvote')}
                      disabled={!location}
                      title={location ? 'Downvote this report' : 'Capture your location to vote'}
                      aria-label="Downvote"
                    >
                      <ThumbsDown size={13} /> {similar.downvotes || 0}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </form>
  )

  const rightSidebarContent = (
    <>
      {!location ? (
        <section className="analytics-intelligence-panel empty">
          <div className="empty-state-container">
            <MapPin size={36} className="empty-icon" />
            <h3>Nearby Reports & Analytics</h3>
            <p>Capture your location in the left sidebar to view nearby incident reports and analytics.</p>
          </div>
        </section>
      ) : selectedReport ? (
        <AnalyticsPanel
          report={selectedReport}
          allReports={nearbyRankedReports}
          userLocation={location}
          onBack={() => setSelectedReportId(null)}
        />
      ) : (
        <section className="nearby-feed-panel">
          <div className="nearby-feed-header">
            <h2>Nearby Incidents</h2>
            <span className="feed-count-pill">{nearbyRankedReports.length} within 15 km</span>
          </div>

          {nearbyRankedReports.length === 0 ? (
            <div className="no-reports-box">
              <p>No incidents reported within 15 km of your location.</p>
            </div>
          ) : (
            <div className="nearby-ranked-feed">
              {nearbyRankedReports.map((report) => {
                const thumbUrl = report.imageUrls?.[0] || report.images?.[0]
                const heroSrc = thumbUrl
                  ? thumbUrl.includes('/upload/')
                    ? thumbUrl.replace('/upload/', '/upload/c_fill,w_350,h_180,g_auto/')
                    : thumbUrl
                  : ''
                const distanceLabel =
                  typeof report.distanceKm === 'number' && isFinite(report.distanceKm)
                    ? report.distanceKm < 1
                      ? `${Math.round(report.distanceKm * 1000)} m away`
                      : `${report.distanceKm.toFixed(1)} km away`
                    : ''

                return (
                  <article
                    key={report.id}
                    className="nearby-report-card"
                    onClick={() => setSelectedReportId(report.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedReportId(report.id)
                      }
                    }}
                  >
                    <div className="feed-card-image-wrapper">
                      {heroSrc ? (
                        <img src={heroSrc} alt={report.title} className="feed-card-image" />
                      ) : (
                        <div className="feed-card-image-placeholder">
                          <Camera size={28} />
                          <span>No media attached</span>
                        </div>
                      )}
                    </div>

                    <div className="feed-card-content">
                      <h3 className="feed-card-title">{report.title}</h3>
                      <div className="feed-card-meta">
                        {distanceLabel ? (
                          <span className="feed-card-distance">{distanceLabel}</span>
                        ) : null}
                        <span className="feed-card-timestamp">
                          <Clock size={12} /> {new Date(report.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="feed-card-votes">
                        <span className="vote-badge up">
                          <ThumbsUp size={14} /> {report.upvotes || 0}
                        </span>
                        <span className="vote-badge down">
                          <ThumbsDown size={14} /> {report.downvotes || 0}
                        </span>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}
    </>
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

              {/* 2D / 3D Mode Toggle UI */}
              <div className="map-view-toggle-container">
                <button
                  type="button"
                  className={`map-view-toggle-btn ${is3DMode ? 'active-3d' : 'active-2d'}`}
                  onClick={() => setIs3DMode((prev) => !prev)}
                  title={is3DMode ? 'Switch to 2D view' : 'Switch to 3D terrain & buildings view'}
                  aria-label="Toggle 2D / 3D map mode"
                >
                  <span className={`toggle-pill-option ${!is3DMode ? 'selected' : ''}`}>2D</span>
                  <span className={`toggle-pill-option ${is3DMode ? 'selected' : ''}`}>3D</span>
                </button>
              </div>

              {isPickingOnMap ? (
                <div className="map-picking-overlay">
                  <span>Tap map to set incident location</span>
                  <button type="button" onClick={() => setIsPickingOnMap(false)}>
                    Cancel
                  </button>
                </div>
              ) : null}
              {!MAPBOX_TOKEN ? (
                <div className="map-overlay-message">
                  Add VITE_MAPBOX_ACCESS_TOKEN to render the map.
                </div>
              ) : null}
            </section>
          ) : null}

          {activeMobilePanel === 'analytics' ? (
            <aside className="mobile-card">{rightSidebarContent}</aside>
          ) : null}
        </section>
      ) : (
        <section className="desktop-stage">
          <div ref={mapContainerRef} className="map-canvas" />

          {/* 2D / 3D Mode Toggle UI */}
          <div className="map-view-toggle-container">
            <button
              type="button"
              className={`map-view-toggle-btn ${is3DMode ? 'active-3d' : 'active-2d'}`}
              onClick={() => setIs3DMode((prev) => !prev)}
              title={is3DMode ? 'Switch to 2D view' : 'Switch to 3D terrain & buildings view'}
              aria-label="Toggle 2D / 3D map mode"
            >
              <span className={`toggle-pill-option ${!is3DMode ? 'selected' : ''}`}>2D</span>
              <span className={`toggle-pill-option ${is3DMode ? 'selected' : ''}`}>3D</span>
            </button>
          </div>

          {isPickingOnMap ? (
            <div className="map-picking-overlay">
              <span>Click anywhere on the map to pinpoint disaster location</span>
              <button type="button" onClick={() => setIsPickingOnMap(false)}>
                Cancel
              </button>
            </div>
          ) : null}
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
            <div className="sidebar-content">{rightSidebarContent}</div>
          </aside>
        </section>
      )}
    </main>
  )
}

export default App

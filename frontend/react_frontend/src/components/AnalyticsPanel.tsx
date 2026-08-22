import React, { useMemo } from 'react'
import {
  ThumbsUp,
  ThumbsDown,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Layers,
  Clock,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

export interface AnalyticsReport {
  id: string
  title: string
  images?: string[]
  imageUrls?: string[]
  location?: {
    lat: number
    lng: number
  }
  createdAt: number
  syncStatus?: 'pending' | 'synced'
  upvotes?: number
  downvotes?: number
  isRemote?: boolean
  aiClassification?: string | null
}

interface AnalyticsPanelProps {
  report: AnalyticsReport
  allReports?: AnalyticsReport[]
  userLocation?: { lat: number; lng: number } | null
  onBack: () => void
}

function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371
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

function formatDistance(distKm?: number): string {
  if (typeof distKm !== 'number' || !isFinite(distKm)) return ''
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m away`
  }
  return `${distKm.toFixed(1)} km away`
}

function getHeroImage(url?: string): string {
  if (!url) return ''
  if (url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/c_fill,w_600,h_340,g_auto/')
  }
  return url
}

const SOURCE_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6']

export default function AnalyticsPanel({
  report,
  allReports = [],
  userLocation,
  onBack,
}: AnalyticsPanelProps): React.JSX.Element {
  // Distance from user to this specific report
  const distanceKm = useMemo(() => {
    if (
      !userLocation ||
      typeof report.location?.lat !== 'number' ||
      typeof report.location?.lng !== 'number'
    ) {
      return undefined
    }
    return calculateDistanceKm(
      userLocation.lat,
      userLocation.lng,
      report.location.lat,
      report.location.lng,
    )
  }, [userLocation, report.location])

  const distanceLabel = formatDistance(distanceKm)

  // Context reports (all nearby or cluster reports, fallback to allReports or [report])
  const contextReports = useMemo(() => {
    if (allReports.length > 0) return allReports
    return [report]
  }, [allReports, report])

  // Intelligence Metrics
  const metrics = useMemo(() => {
    const total = contextReports.length
    const totalUpvotes = contextReports.reduce((acc, r) => acc + (r.upvotes || 0), 0)
    const reportsWithPhotos = contextReports.filter(
      (r) => (r.imageUrls && r.imageUrls.length > 0) || (r.images && r.images.length > 0)
    ).length
    const evidenceRatio = total > 0 ? reportsWithPhotos / total : 0

    // Confidence: derived from photo evidence ratio and upvotes count
    const confidenceScore = Math.min(
      98,
      Math.max(35, Math.round(evidenceRatio * 60 + Math.min((report.upvotes || 0) * 5, 38)))
    )

    // Severity: Decoupled from upvotes; computed based on volume and recent activity
    let severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW'
    const reportUpvotes = report.upvotes || 0
    if (total >= 10 || reportsWithPhotos >= 6) {
      severity = 'CRITICAL'
    } else if (total >= 5 || reportsWithPhotos >= 3 || reportUpvotes >= 10) {
      severity = 'HIGH'
    } else if (total >= 2 || reportUpvotes >= 3) {
      severity = 'MODERATE'
    }

    // Status based on recent report creation
    const now = Date.now()
    const recentReports = contextReports.filter((r) => now - r.createdAt < 30 * 60 * 1000).length
    let status: 'STABLE' | 'DEVELOPING' | 'RAPIDLY DEVELOPING' = 'STABLE'
    if (recentReports >= 4) {
      status = 'RAPIDLY DEVELOPING'
    } else if (recentReports >= 2 || total >= 3) {
      status = 'DEVELOPING'
    }

    const sortedByDate = [...contextReports].sort((a, b) => a.createdAt - b.createdAt)
    const firstReported = sortedByDate[0]?.createdAt
    const lastUpdated = sortedByDate[sortedByDate.length - 1]?.createdAt

    return {
      total,
      totalUpvotes,
      reportsWithPhotos,
      evidencePercentage: Math.round(evidenceRatio * 100),
      confidenceScore,
      severity,
      status,
      recentVelocity: recentReports,
      firstReported: firstReported
        ? new Date(firstReported).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'N/A',
      lastUpdated: lastUpdated
        ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'N/A',
    }
  }, [contextReports, report])

  // Timeline progression for AreaChart
  const growthTimelineData = useMemo(() => {
    if (!contextReports || contextReports.length === 0) return []
    const sorted = [...contextReports].sort((a, b) => a.createdAt - b.createdAt)
    let cumulative = 0
    return sorted.map((r, index) => {
      cumulative += 1
      const timeLabel = new Date(r.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
      return {
        name: timeLabel || `T+${index + 1}`,
        reports: cumulative,
      }
    })
  }, [contextReports])

  // Source Distribution for Donut Chart
  const sourceDistributionData = useMemo(() => {
    if (!contextReports || contextReports.length === 0) return []
    let firsthand = 0
    let nearby = 0
    let remote = 0

    contextReports.forEach((r) => {
      const hasPhoto = (r.imageUrls && r.imageUrls.length > 0) || (r.images && r.images.length > 0)
      const hasLocation = Boolean(r.location?.lat && r.location?.lng)

      if (hasPhoto && hasLocation) {
        firsthand += 1
      } else if (hasLocation) {
        nearby += 1
      } else {
        remote += 1
      }
    })

    return [
      { name: 'Firsthand Witness', value: firsthand },
      { name: 'Nearby Observer', value: nearby },
      { name: 'Remote / Unverified', value: remote },
    ].filter((item) => item.value > 0)
  }, [contextReports])

  // On-site vs. Remote Comparison Data for BarChart
  const locationComparisonData = useMemo(() => {
    if (!contextReports || contextReports.length === 0) return []
    const onSite = contextReports.filter((r) => !r.isRemote).length
    const remote = contextReports.filter((r) => r.isRemote === true).length
    return [
      { category: 'On-site', count: onSite, fill: '#3b82f6' },
      { category: 'Remote', count: remote, fill: '#8b5cf6' },
    ]
  }, [contextReports])

  const imageUrl = report.imageUrls?.[0] || report.images?.[0]
  const heroImageSrc = getHeroImage(imageUrl)

  return (
    <section className="analytics-intelligence-panel expanded">
      {/* Header Action Bar */}
      <div className="analytics-action-bar">
        <button type="button" className="back-summary-btn" onClick={onBack}>
          <ArrowLeft size={16} /> Back to nearby reports
        </button>
        <span className="live-sync-indicator">Analytics</span>
      </div>

      {/* Incident Overview Header */}
      <div className="intel-overview-header">
        <div className="overview-top-row">
          <div>
            <h2>{report.title}</h2>
            <p className="overview-subtitle">
              <MapPin size={13} />{' '}
              {distanceLabel ? `${distanceLabel} • ` : ''}
              {report.location
                ? `Lat ${report.location.lat.toFixed(3)}, Lng ${report.location.lng.toFixed(3)}`
                : 'Dispersed Area'}
            </p>
          </div>
          <span className={`severity-badge ${metrics.severity.toLowerCase()}`}>
            <AlertTriangle size={13} /> {metrics.severity} SEVERITY
          </span>
        </div>

        {report.aiClassification ? (
          <div className="ai-classification-pill">
            <span className="ai-classification-icon">✨</span>
            <span>Classified as: <strong>{report.aiClassification}</strong></span>
          </div>
        ) : null}

        {/* Hero image preview */}
        {heroImageSrc ? (
          <div className="hero-thumbnail-wrapper" style={{ height: '190px', borderRadius: '8px', flexShrink: 0 }}>
            <img src={heroImageSrc} alt={report.title} className="hero-thumbnail-image" />
          </div>
        ) : null}

        {/* Read-only Upvotes & Downvotes */}
        <div className="readonly-vote-bar">
          <span className="readonly-vote up">
            <ThumbsUp size={14} /> {report.upvotes || 0} upvotes
          </span>
          <span className="readonly-vote down">
            <ThumbsDown size={14} /> {report.downvotes || 0} downvotes
          </span>
          <span className="readonly-vote timestamp">
            <Clock size={12} /> {new Date(report.createdAt).toLocaleTimeString()}
          </span>
        </div>

        {/* Metrics Grid */}
        <div className="intel-stats-grid">
          <div className="intel-stat-card">
            <span className="stat-label">Upvotes</span>
            <strong className="stat-value">{report.upvotes || 0}</strong>
            <small className="stat-sub">Raw count</small>
          </div>

          <div className="intel-stat-card">
            <span className="stat-label">Downvotes</span>
            <strong className="stat-value">{report.downvotes || 0}</strong>
            <small className="stat-sub">Raw count</small>
          </div>

          <div className="intel-stat-card">
            <span className="stat-label">Confidence</span>
            <strong className="stat-value text-blue">{metrics.confidenceScore}%</strong>
            <small className="stat-sub">
              <ShieldCheck size={11} /> Evidence-backed
            </small>
          </div>

          <div className="intel-stat-card">
            <span className="stat-label">Status</span>
            <strong className="stat-value status-text">{metrics.status}</strong>
            <small className="stat-sub">Updated {metrics.lastUpdated}</small>
          </div>
        </div>
      </div>

      {/* Visual Statistics: Recharts Area Chart */}
      <div className="chart-card">
        <div className="chart-card-header">
          <h3>Report Volume Progression</h3>
          <span className="chart-pill">+{metrics.recentVelocity} in last 30m</span>
        </div>
        <div className="chart-container-wrapper">
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={growthTimelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorReports" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} />
              <YAxis allowDecimals={false} stroke="#71717a" fontSize={10} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(18, 18, 24, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  color: '#f5f5f7',
                  fontSize: '12px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                }}
              />
              <Area
                type="monotone"
                dataKey="reports"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorReports)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Visual Statistics: Recharts Bar Chart (On-site vs. Remote) */}
      <div className="chart-card">
        <div className="chart-card-header">
          <h3>Report Locations: On-site vs. Remote</h3>
          <span className="chart-pill">Location Type</span>
        </div>
        <div className="chart-container-wrapper">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={locationComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="category" stroke="#71717a" fontSize={11} tickLine={false} />
              <YAxis allowDecimals={false} stroke="#71717a" fontSize={10} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(18, 18, 24, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  color: '#f5f5f7',
                  fontSize: '12px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {locationComparisonData.map((entry, index) => (
                  <Cell key={`bar-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Visual Statistics: Recharts Donut Chart */}
      <div className="chart-card">
        <div className="chart-card-header">
          <h3>Report Source Breakdown</h3>
          <Layers size={14} className="text-muted" />
        </div>
        <div className="donut-chart-container">
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie
                data={sourceDistributionData}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={65}
                paddingAngle={4}
                dataKey="value"
              >
                {sourceDistributionData.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={SOURCE_COLORS[index % SOURCE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(18, 18, 24, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  color: '#f5f5f7',
                  fontSize: '12px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => (
                  <span style={{ fontSize: '11px', color: '#a1a1aa' }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Supporting Evidence Coverage */}
      <div className="chart-card">
        <div className="chart-card-header">
          <h3>Supporting Evidence Coverage</h3>
          <span className="coverage-pct">{metrics.evidencePercentage}% media</span>
        </div>
        <div className="evidence-progress-bar-bg">
          <div
            className="evidence-progress-bar-fill"
            style={{ width: `${metrics.evidencePercentage}%` }}
          />
        </div>
        <div className="evidence-footer">
          <span>📷 {metrics.reportsWithPhotos} photo verified</span>
          <span>📝 {metrics.total - metrics.reportsWithPhotos} text reports</span>
        </div>
      </div>
    </section>
  )
}

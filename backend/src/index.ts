import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { initFirebaseAdmin } from './firebaseAdmin.js'
import { listReports, upsertReport } from './reportsStore.js'
import type { ReportPayload } from './types.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT ?? 8787)
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'

const { configured, firestore, bucket } = initFirebaseAdmin()

app.use(
  cors({
    origin: frontendOrigin,
  }),
)
app.use(express.json({ limit: '12mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, firebaseConfigured: configured })
})

app.get('/api/reports', async (_req, res) => {
  try {
    const reports = await listReports(firestore)
    res.json({ reports })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

app.post('/api/reports', async (req, res) => {
  const payload = req.body as Partial<ReportPayload>

  if (
    !payload ||
    typeof payload.id !== 'string' ||
    typeof payload.title !== 'string' ||
    !payload.location ||
    typeof payload.location.lat !== 'number' ||
    typeof payload.location.lng !== 'number' ||
    typeof payload.createdAt !== 'number' ||
    !Array.isArray(payload.images)
  ) {
    res.status(400).json({ error: 'Invalid report payload' })
    return
  }

  try {
    const stored = await upsertReport(payload as ReportPayload, firestore, bucket)
    res.status(201).json({ report: stored })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

app.listen(port, () => {
  const mode = configured ? 'firebase-backed' : 'memory-only'
  console.log(`Backend listening on http://localhost:${port} (${mode})`)
})

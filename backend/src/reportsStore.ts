import type { Firestore } from 'firebase-admin/firestore'
import type { ReportPayload, StoredReport } from './types.js'

type StorageBucket = {
  name: string
  file: (path: string) => {
    save: (
      data: Buffer,
      options: {
        contentType: string
        resumable: boolean
        public: boolean
      },
    ) => Promise<void>
  }
}

const memoryStore = new Map<string, StoredReport>()

function stripDataUrlPrefix(dataUrl: string) {
  const parts = dataUrl.split(',')
  return parts.length > 1 ? parts[1] : dataUrl
}

async function uploadImagesToFirebase(
  bucket: StorageBucket,
  report: ReportPayload,
): Promise<string[]> {
  const imageUrls: string[] = []

  for (let index = 0; index < report.images.length; index += 1) {
    const base64 = stripDataUrlPrefix(report.images[index])
    const filePath = `reports/${report.id}/image-${index}-${Date.now()}.jpg`
    const file = bucket.file(filePath)

    await file.save(Buffer.from(base64, 'base64'), {
      contentType: 'image/jpeg',
      resumable: false,
      public: false,
    })

    imageUrls.push(`gs://${bucket.name}/${filePath}`)
  }

  return imageUrls
}

export async function listReports(
  firestore: Firestore | null,
): Promise<StoredReport[]> {
  if (!firestore) {
    return Array.from(memoryStore.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  const snapshot = await firestore.collection('reports').get()
  return snapshot.docs
    .map((document) => {
      const data = document.data() as Partial<StoredReport>
      return {
        id: document.id,
        title: data.title ?? 'Untitled incident',
        imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
        location: {
          lat: data.location?.lat ?? 0,
          lng: data.location?.lng ?? 0,
        },
        createdAt: data.createdAt ?? Date.now(),
        updatedAt: data.updatedAt ?? Date.now(),
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function upsertReport(
  report: ReportPayload,
  firestore: Firestore | null,
  bucket: StorageBucket | null,
): Promise<StoredReport> {
  const now = Date.now()

  if (!firestore || !bucket) {
    const nextReport: StoredReport = {
      id: report.id,
      title: report.title,
      imageUrls: [],
      location: report.location,
      createdAt: report.createdAt,
      updatedAt: now,
    }

    memoryStore.set(report.id, nextReport)
    return nextReport
  }

  const imageUrls = await uploadImagesToFirebase(bucket, report)
  const nextReport: StoredReport = {
    id: report.id,
    title: report.title,
    imageUrls,
    location: report.location,
    createdAt: report.createdAt,
    updatedAt: now,
  }

  await firestore.collection('reports').doc(report.id).set(nextReport, { merge: true })
  return nextReport
}

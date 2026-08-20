import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

function readConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET

  return { projectId, clientEmail, privateKey, storageBucket }
}

export function initFirebaseAdmin() {
  const { projectId, clientEmail, privateKey, storageBucket } = readConfig()

  const explicitConfigured =
    Boolean(projectId) && Boolean(clientEmail) && Boolean(privateKey)

  if (!getApps().length) {
    if (explicitConfigured) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        storageBucket,
      })
    } else {
      try {
        initializeApp({ credential: applicationDefault(), storageBucket })
      } catch {
        return { configured: false as const, firestore: null, bucket: null }
      }
    }
  }

  try {
    const firestore = getFirestore()
    const bucket = getStorage().bucket()
    return { configured: true as const, firestore, bucket }
  } catch {
    return { configured: false as const, firestore: null, bucket: null }
  }
}

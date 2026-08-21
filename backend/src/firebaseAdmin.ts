import { initializeApp, cert, getApps, applicationDefault, getApp } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'
import { getStorage, Storage } from 'firebase-admin/storage'

function readConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const rawKey = process.env.FIREBASE_PRIVATE_KEY?.trim()
  const privateKey = rawKey?.replace(/\\n/g, '\n')
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim()

  return { projectId, clientEmail, privateKey, storageBucket }
}

export function initFirebaseAdmin(): {
  configured: boolean
  firestore: Firestore | null
  bucket: any | null
} {
  const { projectId, clientEmail, privateKey, storageBucket } = readConfig()

  const isValidPrivateKey = Boolean(privateKey && privateKey.includes('BEGIN PRIVATE KEY'))
  const explicitConfigured =
    Boolean(projectId) && Boolean(clientEmail) && isValidPrivateKey

  const hasAdc = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS)

  if (!explicitConfigured && !hasAdc) {
    return { configured: false, firestore: null, bucket: null }
  }

  try {
    if (!getApps().length) {
      if (explicitConfigured) {
        initializeApp({
          credential: cert({
            projectId,
            clientEmail: clientEmail!,
            privateKey: privateKey!,
          }),
          storageBucket,
        })
      } else {
        initializeApp({ credential: applicationDefault(), storageBucket })
      }
    }

    const firestore = getFirestore()
    const bucket = storageBucket ? getStorage().bucket(storageBucket) : null
    return { configured: true, firestore, bucket }
  } catch (error) {
    console.warn('Firebase Admin initialization skipped or failed:', error)
    return { configured: false, firestore: null, bucket: null }
  }
}

// frontend/react_frontend/src/FirebaseClient.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'disaster-reporting-93f13.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'disaster-reporting-93f13',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'disaster-reporting-93f13.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1234567890:web:abcdef'
};

export const isFirebaseConfigured = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
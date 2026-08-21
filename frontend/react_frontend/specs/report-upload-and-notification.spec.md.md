# Spec: User Report Upload & Real-time Agent Dispatch

## 1. Overview
Enables citizens to submit emergency/disaster reports with attached media. Raw image binaries are offloaded to Cloudinary CDN, while report metadata and image CDN references are persisted to Firebase Firestore to trigger real-time updates for dispatch agents.

## 2. Requirements & Data Contracts

### 2.1 Environment Configuration
- Cloudinary credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`).
- Firebase Admin Service Account credentials.

### 2.2 Firestore Schema (`tickets` Collection)
```typescript
interface TicketDocument {
  ticketId: string;
  userId?: string;
  title?: string;
  description: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  status: 'open' | 'in-progress' | 'resolved';
  timestamp: string; // ISO 8601
  media?: {
    url: string;
    public_id: string;
  };
  aiMetadata?: {
    confidenceScore: number | null; // Reserved for classifier integration
    classifiedCategory?: string | null;
  };
}
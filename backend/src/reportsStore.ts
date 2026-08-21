import { Firestore, QueryDocumentSnapshot, FieldValue } from 'firebase-admin/firestore'
import notifier from 'node-notifier'
import type { TicketDocument } from './types.js'

const memoryTickets = new Map<string, TicketDocument>()

export async function listTickets(
  firestore: Firestore | null,
): Promise<TicketDocument[]> {
  if (!firestore) {
    return Array.from(memoryTickets.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }

  try {
    const snapshot = await firestore.collection('tickets').orderBy('timestamp', 'desc').get()
    return snapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data() as TicketDocument)
  } catch (error) {
    console.error('Failed to list tickets from Firestore, falling back to memory store:', error)
    return Array.from(memoryTickets.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }
}

export async function saveTicket(
  ticket: TicketDocument,
  firestore: Firestore | null,
): Promise<TicketDocument> {
  const normalizedTicket: TicketDocument = {
    ...ticket,
    upvotes: typeof ticket.upvotes === 'number' ? ticket.upvotes : 0,
    downvotes: typeof ticket.downvotes === 'number' ? ticket.downvotes : 0,
    isRemote: ticket.isRemote ?? false,
    aiClassification: ticket.aiClassification ?? null,
    compositeSeverity: ticket.compositeSeverity || 'LOW',
    aiVisionScore: typeof ticket.aiVisionScore === 'number' ? ticket.aiVisionScore : null,
  }

  memoryTickets.set(normalizedTicket.ticketId, normalizedTicket)

  if (firestore) {
    try {
      await firestore.collection('tickets').doc(normalizedTicket.ticketId).set(normalizedTicket, { merge: true })
    } catch (error) {
      console.error('Failed to save ticket to Firestore:', error)
    }
  }

  return normalizedTicket
}

export type VoteResult =
  | { notFound: true }
  | { deleted: true; ticketId: string }
  | { deleted: false; ticket: TicketDocument }

export async function voteTicket(
  ticketId: string,
  action: 'upvote' | 'downvote',
  firestore: Firestore | null,
): Promise<VoteResult> {
  if (firestore) {
    try {
      const ticketRef = firestore.collection('tickets').doc(ticketId)
      const existingDoc = await ticketRef.get()

      if (!existingDoc.exists) {
        return { notFound: true }
      }

      // Increment upvotes or downvotes using FieldValue.increment
      await ticketRef.update({
        [action === 'upvote' ? 'upvotes' : 'downvotes']: FieldValue.increment(1),
      })

      const updatedDoc = await ticketRef.get()
      const data = updatedDoc.data() as TicketDocument
      const upvotes = typeof data.upvotes === 'number' ? data.upvotes : 0
      const downvotes = typeof data.downvotes === 'number' ? data.downvotes : 0

      // Moderation threshold: net negative score >= 100
      if (downvotes - upvotes >= 100) {
        await ticketRef.delete()
        memoryTickets.delete(ticketId)
        return { deleted: true, ticketId }
      }

      memoryTickets.set(ticketId, data)
      return { deleted: false, ticket: data }
    } catch (error) {
      console.error('Firestore vote error, trying memory store:', error)
    }
  }

  // Fallback / in-memory store voting
  const ticket = memoryTickets.get(ticketId)
  if (!ticket) {
    return { notFound: true }
  }

  if (action === 'upvote') {
    ticket.upvotes = (ticket.upvotes || 0) + 1
  } else {
    ticket.downvotes = (ticket.downvotes || 0) + 1
  }

  if ((ticket.downvotes || 0) - (ticket.upvotes || 0) >= 100) {
    memoryTickets.delete(ticketId)
    return { deleted: true, ticketId }
  }

  memoryTickets.set(ticketId, ticket)
  return { deleted: false, ticket }
}

// --------------------------------------------------------------------------
// Automated Incident Severity, AI Vision Analysis & Clustering Utilities
// --------------------------------------------------------------------------

export function calculateDistanceKm(
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

export function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'and', 'with', 'from', 'that', 'this', 'have', 'near', 'area',
    'road', 'street', 'some', 'there', 'their', 'about', 'into', 'over',
    'after', 'under', 'above', 'across', 'around', 'report', 'incident', 'alert', 'disaster'
  ])
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
  return new Set(tokens)
}

export function findMatchingClusterTickets(
  incoming: TicketDocument,
  allTickets: TicketDocument[],
): TicketDocument[] {
  const incomingKeywords = extractKeywords(incoming.title || incoming.description || '')
  const incomingTime = incoming.createdAt || (incoming.timestamp ? new Date(incoming.timestamp).getTime() : Date.now())
  const incomingLat = incoming.location?.lat ?? incoming.location?.latitude
  const incomingLng = incoming.location?.lng ?? incoming.location?.longitude

  return allTickets.filter((historical) => {
    if (historical.ticketId === incoming.ticketId) return false

    // 1. Spatial check: <= 15km
    const histLat = historical.location?.lat ?? historical.location?.latitude
    const histLng = historical.location?.lng ?? historical.location?.longitude
    if (
      typeof incomingLat === 'number' &&
      typeof incomingLng === 'number' &&
      typeof histLat === 'number' &&
      typeof histLng === 'number'
    ) {
      const dist = calculateDistanceKm(incomingLat, incomingLng, histLat, histLng)
      if (dist > 15.0) return false
    }

    // 2. Textual check: share significant keywords (>3 chars, non-stopwords)
    const histKeywords = extractKeywords(historical.title || historical.description || '')
    let sharesKeyword = false
    for (const kw of incomingKeywords) {
      if (histKeywords.has(kw)) {
        sharesKeyword = true
        break
      }
    }
    if (!sharesKeyword && incomingKeywords.size > 0 && histKeywords.size > 0) {
      return false
    }

    // 3. Temporal check: within rolling window of 3 hours
    const histTime = historical.createdAt || (historical.timestamp ? new Date(historical.timestamp).getTime() : 0)
    const timeDiff = Math.abs(incomingTime - histTime)
    if (timeDiff > 3 * 60 * 60 * 1000) {
      return false
    }

    return true
  })
}

export function evaluateCompositeSeverity(
  clusterTickets: TicketDocument[],
  aiVisionScore: number | null,
  incomingTime: number = Date.now(),
): { severity: 'LOW' | 'MEDIUM' | 'HIGH'; totalClusterCount: number } {
  const totalCount = clusterTickets.length + 1

  // Count reports in last 1 hour
  const count1h =
    clusterTickets.filter((t) => {
      const tTime = t.createdAt || (t.timestamp ? new Date(t.timestamp).getTime() : 0)
      return Math.abs(incomingTime - tTime) <= 60 * 60 * 1000
    }).length + 1

  // Count reports in last 3 hours
  const count3h =
    clusterTickets.filter((t) => {
      const tTime = t.createdAt || (t.timestamp ? new Date(t.timestamp).getTime() : 0)
      return Math.abs(incomingTime - tTime) <= 3 * 60 * 60 * 1000
    }).length + 1

  // HIGH Severity:
  // - >= 100 reports in last 1 hour
  // - OR >= 50 reports AND aiVisionScore >= 85
  if (count1h >= 100 || (totalCount >= 50 && typeof aiVisionScore === 'number' && aiVisionScore >= 85)) {
    return { severity: 'HIGH', totalClusterCount: totalCount }
  }

  // MEDIUM Severity:
  // - >= 50 reports in last 3 hours
  // - OR aiVisionScore >= 60
  if (count3h >= 50 || (typeof aiVisionScore === 'number' && aiVisionScore >= 60)) {
    return { severity: 'MEDIUM', totalClusterCount: totalCount }
  }

  // LOW Severity
  return { severity: 'LOW', totalClusterCount: totalCount }
}

export async function batchUpdateClusterSeverity(
  tickets: TicketDocument[],
  newSeverity: 'LOW' | 'MEDIUM' | 'HIGH',
  firestore: Firestore | null,
): Promise<void> {
  const newStatus = newSeverity === 'HIGH' ? 'escalated' : newSeverity === 'MEDIUM' ? 'developing' : 'open'

  for (const ticket of tickets) {
    ticket.compositeSeverity = newSeverity
    ticket.status = newStatus
    memoryTickets.set(ticket.ticketId, ticket)
  }

  if (firestore && tickets.length > 0) {
    try {
      const batch = firestore.batch()
      for (const ticket of tickets) {
        const ref = firestore.collection('tickets').doc(ticket.ticketId)
        batch.update(ref, {
          compositeSeverity: newSeverity,
          status: newStatus,
        })
      }
      await batch.commit()
    } catch (error) {
      console.error('Failed to batch update cluster severity in Firestore:', error)
    }
  }
}

export function notifySeverityEscalation(
  severity: 'LOW' | 'MEDIUM' | 'HIGH',
  reportCount: number,
) {
  try {
    notifier.notify({
      title: 'Disaster Severity Escalation',
      message: `WARNING: Incident escalated to ${severity}. ${reportCount} reports and AI confirmation detected.`,
      sound: true,
    })
  } catch (err) {
    console.warn('Developer notification failed:', err)
  }
}

// Backward-compatible aliases for legacy scaffold endpoints if needed
export const listReports = listTickets
export const upsertReport = async (
  report: TicketDocument,
  firestore: Firestore | null,
): Promise<TicketDocument> => saveTicket(report, firestore)

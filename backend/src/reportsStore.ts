import { Firestore, QueryDocumentSnapshot, FieldValue } from 'firebase-admin/firestore'
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

// Backward-compatible aliases for legacy scaffold endpoints if needed
export const listReports = listTickets
export const upsertReport = async (
  report: TicketDocument,
  firestore: Firestore | null,
): Promise<TicketDocument> => saveTicket(report, firestore)

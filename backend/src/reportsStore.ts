import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore'
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
  memoryTickets.set(ticket.ticketId, ticket)

  if (firestore) {
    try {
      await firestore.collection('tickets').doc(ticket.ticketId).set(ticket, { merge: true })
    } catch (error) {
      console.error('Failed to save ticket to Firestore:', error)
    }
  }

  return ticket
}

// Backward-compatible aliases for legacy scaffold endpoints if needed
export const listReports = listTickets
export const upsertReport = async (
  report: TicketDocument,
  firestore: Firestore | null,
): Promise<TicketDocument> => saveTicket(report, firestore)

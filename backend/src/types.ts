export interface ReportPayload {
  id?: string;
  userId?: string;
  title?: string;
  description?: string;
  latitude?: number | string;
  longitude?: number | string;
  location?: {
    lat?: number;
    lng?: number;
    latitude?: number;
    longitude?: number;
    address?: string;
  };
  address?: string;
  images?: string[];
  createdAt?: number;
  isRemote?: boolean;
  aiClassification?: string | null;
  compositeSeverity?: 'LOW' | 'MEDIUM' | 'HIGH';
  aiVisionScore?: number | null;
}

export interface TicketDocument {
  ticketId: string;
  id?: string;
  userId?: string;
  title?: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved' | 'escalated' | 'developing';
  timestamp: string;
  createdAt?: number;
  upvotes: number;
  downvotes: number;
  isRemote?: boolean;
  aiClassification?: string | null;
  compositeSeverity?: 'LOW' | 'MEDIUM' | 'HIGH';
  aiVisionScore?: number | null;
  location?: {
    latitude: number;
    longitude: number;
    lat?: number;
    lng?: number;
    address?: string;
  };
  media?: {
    url: string;
    public_id: string;
  };
  imageUrls?: string[];
  aiMetadata?: {
    confidenceScore: number | null; // Pre-configured for upcoming classifier model
    classifiedCategory?: string | null;
  };
}

export type StoredReport = TicketDocument;
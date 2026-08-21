import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../FirebaseClient'; // Frontend Firebase client instance

// Utility to apply dynamic Cloudinary transformation for lightweight thumbnails
const getThumbnailUrl = (url?: string) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/c_thumb,w_300,h_200,g_auto/');
};

export const AgentFeed: React.FC = () => {
  const [tickets, setTickets] = useState<any[]>([]);

  useEffect(() => {
    try {
      const q = query(collection(db, 'tickets'), orderBy('timestamp', 'desc'));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const liveTickets = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setTickets(liveTickets);
        },
        (error) => {
          console.warn('Firestore real-time subscription error in AgentFeed:', error.message);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.warn('Unable to subscribe to Firestore tickets:', err);
    }
  }, []);

  return (
    <div className="agent-dashboard">
      <h2>Incoming Emergency Dispatches ({tickets.length})</h2>
      <div className="ticket-list">
        {tickets.map((t) => (
          <div key={t.ticketId || t.id} className="ticket-card">
            <span className={`badge status-${t.status}`}>{t.status}</span>
            <p className="desc">{t.description}</p>
            <small>{new Date(t.timestamp).toLocaleTimeString()}</small>
            
            {t.aiMetadata?.confidenceScore !== null && (
              <div className="ai-score">
                Confidence: {(t.aiMetadata.confidenceScore * 100).toFixed(1)}%
              </div>
            )}

            {t.media?.url && (
              <a href={t.media.url} target="_blank" rel="noopener noreferrer">
                <img
                  src={getThumbnailUrl(t.media.url)}
                  alt="Incident evidence"
                  className="ticket-thumb"
                />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
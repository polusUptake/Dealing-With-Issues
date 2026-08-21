import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import { initFirebaseAdmin } from './firebaseAdmin.js';
import { uploadImageBuffer, uploadDataUrl } from './cloudinary.js';
import { listTickets, saveTicket } from './reportsStore.js';
import { TicketDocument } from './types.js';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// 1. Initialize Firebase Admin
const { configured, firestore } = initFirebaseAdmin();

// Helper to verify Cloudflare Turnstile token
async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  const secretKey = process.env.CLOUDFLARE_SECRET_KEY?.trim();
  if (!secretKey) {
    return true; // If secret key not set in dev, allow
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
    return Boolean(data.success);
  } catch (error) {
    console.error('Error verifying Cloudflare Turnstile token:', error);
    return false;
  }
}

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  return res.status(200).json({
    status: 'ok',
    firebaseConfigured: configured,
    cloudinaryConfigured: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
    turnstileConfigured: Boolean(process.env.CLOUDFLARE_SECRET_KEY),
  });
});

// POST: Submit a new report with image
app.post('/api/reports', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const turnstileToken =
      req.body['cf-turnstile-response'] ||
      req.body.turnstileToken ||
      (req.headers['x-turnstile-token'] as string);

    if (process.env.CLOUDFLARE_SECRET_KEY) {
      if (!turnstileToken) {
        return res.status(400).json({ error: 'Security verification (Turnstile CAPTCHA) is required.' });
      }

      const isValidHuman = await verifyTurnstileToken(turnstileToken, req.ip);
      if (!isValidHuman) {
        return res.status(403).json({ error: 'Security verification failed. Please complete the CAPTCHA.' });
      }
    }

    const { title, description, userId, latitude, longitude, address, location, images, image } = req.body;

    const reportDesc = description || title;
    if (!reportDesc) {
      return res.status(400).json({ error: 'Description or title is required' });
    }

    let media: { url: string; public_id: string } | undefined = undefined;

    // 1. Check if a binary file was uploaded via multipart/form-data
    if (req.file) {
      const uploadResult = await uploadImageBuffer(req.file.buffer);
      media = {
        url: uploadResult.url,
        public_id: uploadResult.public_id,
      };
    } 
    // 2. Check if a base64 data URL was sent via JSON
    else if (typeof image === 'string' && image.startsWith('data:')) {
      const uploadResult = await uploadDataUrl(image);
      media = {
        url: uploadResult.url,
        public_id: uploadResult.public_id,
      };
    } else if (Array.isArray(images) && images.length > 0 && typeof images[0] === 'string' && images[0].startsWith('data:')) {
      const uploadResult = await uploadDataUrl(images[0]);
      media = {
        url: uploadResult.url,
        public_id: uploadResult.public_id,
      };
    }

    // Parse location coordinates
    let lat: number | undefined;
    let lng: number | undefined;

    if (location && typeof location === 'object') {
      lat = typeof location.lat === 'number' ? location.lat : typeof location.latitude === 'number' ? location.latitude : undefined;
      lng = typeof location.lng === 'number' ? location.lng : typeof location.longitude === 'number' ? location.longitude : undefined;
    } else {
      if (latitude !== undefined && latitude !== '') lat = parseFloat(latitude);
      if (longitude !== undefined && longitude !== '') lng = parseFloat(longitude);
    }

    const ticketId = req.body.id || crypto.randomUUID();
    const newTicket: TicketDocument = {
      ticketId,
      id: ticketId,
      userId: userId || 'anonymous',
      title: title || reportDesc.slice(0, 50),
      description: reportDesc,
      status: 'open',
      timestamp: new Date().toISOString(),
      createdAt: req.body.createdAt ? Number(req.body.createdAt) : Date.now(),
      location: lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng) ? {
        latitude: lat,
        longitude: lng,
        lat,
        lng,
        address: address || '',
      } : undefined,
      media,
      imageUrls: media ? [media.url] : [],
      aiMetadata: {
        confidenceScore: null,
        classifiedCategory: null,
      },
    };

    const saved = await saveTicket(newTicket, firestore);

    return res.status(201).json({
      success: true,
      ticket: saved,
      report: saved,
    });
  } catch (error: any) {
    console.error('Error submitting report:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// GET: Retrieve all active tickets
app.get('/api/reports', async (_req: Request, res: Response) => {
  try {
    const tickets = await listTickets(firestore);
    return res.status(200).json({
      success: true,
      tickets,
      reports: tickets,
    });
  } catch (error: any) {
    console.error('Error fetching reports:', error);  
    return res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Report backend service running on port ${PORT} (Firebase Configured: ${configured})`);
});
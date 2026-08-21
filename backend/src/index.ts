import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import { initFirebaseAdmin } from './firebaseAdmin.js';
import { uploadImageBuffer, uploadDataUrl } from './cloudinary.js';
import {
  listTickets,
  saveTicket,
  voteTicket,
  findMatchingClusterTickets,
  evaluateCompositeSeverity,
  batchUpdateClusterSeverity,
  notifySeverityEscalation,
} from './reportsStore.js';
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

const HF_TOKEN = process.env.HF_API_TOKEN || process.env.VITE_HF_API_TOKEN || '';

async function analyzeImageWithHuggingFace(
  imageSource: Buffer | string,
): Promise<{ aiVisionScore: number | null; aiClassification: string | null }> {
  if (!HF_TOKEN) {
    return { aiVisionScore: null, aiClassification: null };
  }

  try {
    let bodyBuffer: Buffer;
    if (Buffer.isBuffer(imageSource)) {
      bodyBuffer = imageSource;
    } else if (typeof imageSource === 'string' && imageSource.startsWith('data:')) {
      const base64Data = imageSource.split(',')[1];
      bodyBuffer = Buffer.from(base64Data, 'base64');
    } else {
      return { aiVisionScore: null, aiClassification: null };
    }

    const response = await fetch(
      'https://api-inference.huggingface.co/models/Luwayy/disaster_images_model',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(bodyBuffer),
      },
    );

    if (!response.ok) {
      console.warn('Backend HF API call returned non-200 status:', response.status);
      return { aiVisionScore: null, aiClassification: null };
    }

    const data = (await response.json()) as Array<{ label: string; score: number }> | { error?: string };
    if (!Array.isArray(data) || data.length === 0) {
      return { aiVisionScore: null, aiClassification: null };
    }

    const bestMatch = data.reduce((prev, current) => {
      return (current.score ?? 0) > (prev.score ?? 0) ? current : prev;
    }, data[0]);

    const aiVisionScore = Math.round((bestMatch.score || 0) * 100);
    const aiClassification = bestMatch.label || null;

    return { aiVisionScore, aiClassification };
  } catch (error) {
    console.warn('Backend Hugging Face vision inference error:', error);
    return { aiVisionScore: null, aiClassification: null };
  }
}

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
    let aiVisionScore: number | null = typeof req.body.aiVisionScore === 'number' ? req.body.aiVisionScore : null;
    let aiClassification: string | null = req.body.aiClassification || req.body.aiMetadata?.classifiedCategory || null;

    // 1. Check if a binary file was uploaded via multipart/form-data
    if (req.file) {
      const [uploadResult, aiResult] = await Promise.all([
        uploadImageBuffer(req.file.buffer),
        analyzeImageWithHuggingFace(req.file.buffer),
      ]);
      media = {
        url: uploadResult.url,
        public_id: uploadResult.public_id,
      };
      if (aiResult.aiVisionScore !== null) aiVisionScore = aiResult.aiVisionScore;
      if (aiResult.aiClassification) aiClassification = aiResult.aiClassification;
    } 
    // 2. Check if a base64 data URL was sent via JSON
    else if (typeof image === 'string' && image.startsWith('data:')) {
      const [uploadResult, aiResult] = await Promise.all([
        uploadDataUrl(image),
        analyzeImageWithHuggingFace(image),
      ]);
      media = {
        url: uploadResult.url,
        public_id: uploadResult.public_id,
      };
      if (aiResult.aiVisionScore !== null) aiVisionScore = aiResult.aiVisionScore;
      if (aiResult.aiClassification) aiClassification = aiResult.aiClassification;
    } else if (Array.isArray(images) && images.length > 0 && typeof images[0] === 'string' && images[0].startsWith('data:')) {
      const [uploadResult, aiResult] = await Promise.all([
        uploadDataUrl(images[0]),
        analyzeImageWithHuggingFace(images[0]),
      ]);
      media = {
        url: uploadResult.url,
        public_id: uploadResult.public_id,
      };
      if (aiResult.aiVisionScore !== null) aiVisionScore = aiResult.aiVisionScore;
      if (aiResult.aiClassification) aiClassification = aiResult.aiClassification;
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
    const createdAt = req.body.createdAt ? Number(req.body.createdAt) : Date.now();

    const candidateTicket: TicketDocument = {
      ticketId,
      id: ticketId,
      userId: userId || 'anonymous',
      title: title || reportDesc.slice(0, 50),
      description: reportDesc,
      status: 'open',
      timestamp: new Date().toISOString(),
      createdAt,
      upvotes: 0,
      downvotes: 0,
      isRemote: typeof req.body.isRemote === 'boolean' ? req.body.isRemote : false,
      aiClassification,
      aiVisionScore,
      compositeSeverity: 'LOW',
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
        confidenceScore: aiVisionScore,
        classifiedCategory: aiClassification,
      },
    };

    // Evaluate cluster and composite severity
    const allTickets = await listTickets(firestore);
    const clusterTickets = findMatchingClusterTickets(candidateTicket, allTickets);
    const { severity, totalClusterCount } = evaluateCompositeSeverity(
      clusterTickets,
      aiVisionScore,
      candidateTicket.createdAt
    );

    candidateTicket.compositeSeverity = severity;
    candidateTicket.status = severity === 'HIGH' ? 'escalated' : severity === 'MEDIUM' ? 'developing' : 'open';

    // If severity is escalated to MEDIUM or HIGH, batch-update the cluster
    if (severity === 'HIGH' || severity === 'MEDIUM') {
      await batchUpdateClusterSeverity(clusterTickets, severity, firestore);
      notifySeverityEscalation(severity, totalClusterCount);
    }

    const saved = await saveTicket(candidateTicket, firestore);

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

// POST: Vote on an existing report
app.post('/api/reports/:id/vote', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { action } = req.body;

    if (action !== 'upvote' && action !== 'downvote') {
      return res.status(400).json({ error: "Action must be 'upvote' or 'downvote'" });
    }

    const result = await voteTicket(id, action, firestore);

    if ('notFound' in result) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (result.deleted) {
      return res.status(200).json({
        success: true,
        deleted: true,
        ticketId: id,
        message: 'Report deleted due to community moderation threshold',
      });
    }

    return res.status(200).json({
      success: true,
      deleted: false,
      ticket: result.ticket,
      report: result.ticket,
    });
  } catch (error: any) {
    console.error('Error voting on report:', error);
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
---
name: Hugging Face Image Classification Integration
description: Directly call the Hugging Face Inference API from the frontend to classify uploaded images, store the result in Firebase, and display classification badges on report cards.
targets:
  - ../src/App.tsx
  - ../src/App.css
  - ../../../backend/src/types.ts
  - ../../../backend/src/index.ts
---

# Hugging Face Image Classification Integration

This specification details the integration of the `Luwayy/disaster_images_model` via the Hugging Face Inference API. The frontend will pass the uploaded image to the model, append the resulting classification label to the report payload, store it in Firebase, and visually display it on the ranked feed.

## 1. Environment Configuration

To authenticate with Hugging Face without setting up a backend proxy, the frontend requires an API token.
- Add `VITE_HF_API_TOKEN` to `frontend/react_frontend/.env`.
- Ensure the fetch calls to the Hugging Face API include this token in the `Authorization: Bearer <TOKEN>` header.
  `[@test] ../src/__tests__/classification/hf-env-token-presence.test.tsx`

## 2. Backend Schema Updates

The backend must be updated to accept and persist the new classification data.

- **Types (`backend/src/types.ts`)**: Update `ReportPayload` and `StoredReport` to include an `aiClassification?: string | null` property (or update the existing placeholder `aiMetadata.classifiedCategory` to match this logic).
  `[@test] ../../../backend/tests/schema-classification-field.test.ts`
- **Controller (`backend/src/index.ts`)**: Update the `POST /api/reports` endpoint to extract `aiClassification` from `req.body` and pass it to the Firebase creation payload.
  `[@test] ../../../backend/tests/api-accepts-classification.test.ts`

## 3. Frontend Inference API Call

During the report submission flow in `App.tsx`, intercept the image before sending the final payload to the backend.

- **API Endpoint:** Use `https://api-inference.huggingface.co/models/Luwayy/disaster_images_model`.
- **Logic:** 
  - If the user attaches an image, convert the file to a Blob/ArrayBuffer and send a `POST` request to the HF API.
  - The HF API returns an array of objects (e.g., `[{ label: 'flood', score: 0.95 }, ...]`).
  - Extract the `label` of the object with the highest `score`.
- **Fault Tolerance:** If the HF API fails, times out, or the model is still loading, catch the error and allow the report submission to proceed smoothly with `aiClassification: null`.
  `[@test] ../src/__tests__/classification/hf-inference-api-call.test.tsx`
  `[@test] ../src/__tests__/classification/hf-fallback-on-error.test.tsx`

## 4. UI: Ranked Feed Classification Badges

The ranked feed in the right sidebar must visually indicate the AI's classification.

- In the map over `nearbyRankedReports`, check if `report.aiClassification` exists and is not null.
- If present, render a prominent tag/badge inside the `report-card` (e.g., in the `.report-card-meta` or alongside the title).
- The badge should dynamically display the label: `Classified as: {report.aiClassification}`.
- Apply distinct CSS styling (e.g., a specific background color or border) to visually differentiate the AI badge from the Distance or Severity badges.
  `[@test] ../src/__tests__/classification/feed-badge-rendering.test.tsx`


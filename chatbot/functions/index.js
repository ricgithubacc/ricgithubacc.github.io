/* eslint-disable no-console */
// Drop-in Cloud Functions v2 Express app with solid CORS + SSE keepalive
// - Allows GitHub Pages origin (https://richardtran.website) and localhost
// - Answers CORS preflight (OPTIONS) fast
// - Streams responses with proper SSE headers and periodic keepalives
// - Verifies Firebase ID token
// - Calls Google AI Studio (OpenAI-compatible) chat completions (streaming)

const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const express = require('express');

// --- Secret for AI provider (configure in Firebase console > Build > Functions > Secrets) ---
const LLM_KEY = defineSecret('LLM_KEY');

// --- Firebase Admin ---
try {
  admin.app();
} catch (_) {
  admin.initializeApp();
}
const db = admin.firestore();

// --- Express app ---
const app = express();

// -----------------------------
// CORS: allow specific origins
// -----------------------------
const ALLOW = new Set([
  'https://richardtran.website', // GitHub Pages
  'http://localhost:8000', // local dev (python -m http.server 8000)
  'http://127.0.0.1:8000',
]);

// Attach CORS headers to all responses
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOW.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  // Always vary on Origin so caches don't mix responses
  res.setHeader('Vary', 'Origin');
  next();
});

// Answer CORS preflight quickly (before auth/body parsing)
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With',
  );
  res.setHeader('Access-Control-Max-Age', '86400'); // 24h
  res.status(204).end();
});

// -----------------------------
// Provider config (Google AI Studio, OpenAI-compatible endpoint)
// -----------------------------
const PROVIDER_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const PROVIDER_MODEL = 'gemini-2.5-flash'; // adjust if desired

// -----------------------------
// Auth: verify Firebase ID token from Authorization: Bearer <token>
// -----------------------------
async function verifyAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const m = hdr.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).send('Missing ID token');
  try {
    req.user = await admin.auth().verifyIdToken(m[1]);
    return next();
  } catch (e) {
    console.error('Auth error:', e);
    return res.status(401).send('Invalid ID token');
  }
}

// Helper: parse JSON body safely without body-parser (so we don't interfere with SSE)
function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// -----------------------------
// Chat endpoint (SSE streaming)
// -----------------------------
app.post('/chat', verifyAuth, async (req, res) => {
  // CORS headers on the actual POST response too
  const origin = req.headers.origin;
  if (!origin || ALLOW.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Vary', 'Origin');

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  // Keepalive ping so proxies don't time out long-running streams
  // Send an immediate no-op so the client sees activity
  res.write('event: ready\ndata: {}\n\n');

  // Keep the HTTP stream active every 15s while waiting on upstream
  const keepalive = setInterval(() => {
    // AFTER (valid)
    // AFTER (valid)
    try {
      res.write(':\\n\\n');
    } catch (e) {/* ignore */}
  }, 15000);

  try {
    const body = await readJson(req);
    const uid = req.user.uid;
    const thread = String(body.thread || 'main');
    const userMsg = String(body.message || '').slice(0, 8000);

    if (!userMsg) {
      res.write(
          `event: error\ndata: ${JSON.stringify({error: 'Empty message'})}\n\n`,
      );
      return res.end();
    }

    // Load short history for context
    const docRef = db.doc(`users/${uid}/chats/${thread}`);
    const snap = await docRef.get();
    const history = snap.exists ? Array.isArray(snap.data().history) ? snap.data().history : [] : [];

    const system = {role: 'system', content: 'You are a concise, helpful assistant.'};
    const messages = [
      system,
      ...history.filter((m) => m && m.role !== 'system'),
      {role: 'user', content: userMsg},
    ];

    const apiKey = LLM_KEY.value();
    if (!apiKey) {
      res.write(
          `event: error\ndata: ${JSON.stringify({error: 'Missing LLM_KEY secret'})}\n\n`,
      );
      return res.end();
    }

    // Call provider (streaming)
    const upstream = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PROVIDER_MODEL,
        stream: true,
        temperature: 0.2,
        max_tokens: 512,
        messages,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => `${upstream.status}`);
      console.error('Upstream error:', upstream.status, text);
      res.write(`event: error\ndata: ${JSON.stringify({error: text || 'Upstream error'})}\n\n`);
      return res.end();
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let assistant = '';

    // Stream frames to client and accumulate assistant text from OpenAI-style deltas
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);

      // Forward raw stream (as data: ... lines)
      res.write(`data: ${chunk}\n\n`);

      // Parse to collect assistant text
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const obj = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content || '';
          if (delta) assistant += delta;
        } catch (_) {/* ignore non-JSON frames */}
      }
    }

    // Save conversation tail
    if (assistant.trim()) {
      const newHistory = [
        ...history,
        {role: 'user', content: userMsg},
        {role: 'assistant', content: assistant},
      ];
      await docRef.set({history: newHistory.slice(-200)}, {merge: true});
    }

    res.write('event: done\ndata: {}\n\n');
    res.end();
    clearInterval(keepalive);
  } catch (e) {
    console.error('Handler error:', e);
    res.write(`event: error\ndata: ${JSON.stringify({error: String(e && e.message || e)})}\n\n`);
    res.end();
  } finally {
    clearInterval(keepalive);
  }
});

// -----------------------------
// Export the HTTPS function
// -----------------------------
exports.api = onRequest(
    {
      region: 'us-central1',
      timeoutSeconds: 120,
      memory: '512MiB',
      minInstances: 0,
      maxInstances: 2,
      secrets: [LLM_KEY],
    },
    app,
);

/* eslint-disable no-console */

const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

const LLM_KEY = defineSecret('LLM_KEY'); // <-- v2 secret handle

admin.initializeApp();
const db = admin.firestore();

const app = express();


// tighten this for prod: list your origins instead of "true"
const allowedOrigins = true;
const allowed = ['https://richardtran.website', 'http://localhost:8000'];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowed.includes(origin)),
}));


// ---- Provider config (Gemini OpenAI-compatible) ----
const PROVIDER_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const PROVIDER_MODEL = 'gemini-2.5-flash'; // choose the model you want

// ---- Auth middleware: verify Firebase ID token ----
async function verifyAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const m = hdr.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).send('Missing ID token');
  try {
    req.user = await admin.auth().verifyIdToken(m[1]);
    next();
  } catch (e) {
    res.status(401).send('Invalid ID token');
  }
}

// ---- Chat endpoint (streams tokens) ----
app.post('/chat', verifyAuth, async (req, res) => {
  try {
    // Parse JSON body
    const body = await new Promise((ok) => {
      let raw = '';
      req.on('data', (c) => {
        raw += c;
      });
      req.on('end', () => ok(raw ? JSON.parse(raw) : {}));
    });

    const uid = req.user.uid;
    const thread = body.thread || 'main';
    const userMsg = String(body.message || '').slice(0, 8000);

    // Load prior history
    const docRef = db.doc(`users/${uid}/chats/${thread}`);
    const snap = await docRef.get();
    const history = snap.exists ? (snap.data().history || []) : [];

    // Build messages (server-authoritative system prompt)
    const system = {role: 'system', content: 'You are a concise, helpful assistant.'};
    const messages = [
      system,
      ...history.filter((m) => m.role !== 'system'),
      {role: 'user', content: userMsg},
    ];

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const apiKey = LLM_KEY.value();
    if (!apiKey) {
      res.write(`event: error\ndata: ${JSON.stringify({error: 'Missing LLM_KEY secret'})}\n\n`);
      return res.end();
    }


    // Call provider with streaming
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
      const text = await upstream.text();
      res.write(`event: error\ndata: ${JSON.stringify({error: text})}\n\n`);
      return res.end();
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let assistant = '';

    // --- Stream loop (no-constant-condition friendly) ---
    let done = false;
    while (!done) {
      const read = await reader.read();
      done = !!read.done;
      if (done) break;

      const chunk = decoder.decode(read.value);
      // Forward raw chunk to client
      res.write(`data: ${chunk}\n\n`);

      // Build assistant text by collecting delta tokens (OpenAI-style)
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const obj = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content || '';
          if (delta) assistant += delta;
        } catch (err) {
          // Non-JSON frame (keep-alive / done / heartbeat) — skip
          continue;
        }
      }
    }

    // Save history (trim to last N messages)
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
  } catch (e) {
    res.write(`event: error\ndata: ${JSON.stringify({error: String(e)})}\n\n`);
    res.end();
  }
});

exports.api = onRequest(
    {
      region: 'us-central1',
      timeoutSeconds: 60,
      memory: '256MiB', // v2 uses MiB strings
      minInstances: 0,
      maxInstances: 1, // cost guardrail
      secrets: [LLM_KEY], // provide the secret to the function
    },
    app,
);

/**
 * api/chat.js  —  Drop-in replacement for your Groq handler
 * Zero API keys. Zero tokens. Zero cost.
 * Uses the custom NoteBuddy AI engine.
 */

import { engine } from '../engine.js';

// Simple in-memory rate limiter (resets on server restart, fine for a school server)
const ipMap = new Map();
const activeRequests = { count: 0 };

function msgText(m) {
  if (typeof m?.content === 'string' && m.content.trim()) return m.content;
  if (typeof m?.parts?.[0]?.text === 'string') return m.parts[0].text;
  return '';
}

export default async function handler(req, res) {
  const send = (status, obj) => {
    res.status(status);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(obj));
  };

  if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });

  // Rate limiting — same as before
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  if (now - (ipMap.get(ip) || 0) < 1500) return send(429, { error: 'Slow down a bit' });
  ipMap.set(ip, now);

  if (activeRequests.count >= 10) return send(429, { error: 'Server busy — try again' });
  activeRequests.count++;

  try {
    const body = req.body || {};
    const history = Array.isArray(body.history) ? body.history : [];

    if (!history.length) {
      activeRequests.count--;
      return send(400, { error: 'Empty conversation' });
    }

    const lastMessage = history[history.length - 1];
    const question = msgText(lastMessage);

    if (!question) {
      activeRequests.count--;
      return send(400, { error: 'No question found' });
    }

    // Pass full history for context-aware responses
    const reply = await engine(question, history);

    activeRequests.count--;
    return send(200, { reply });

  } catch (err) {
    activeRequests.count--;
    return send(500, { error: 'Engine error: ' + err.message });
  }
}

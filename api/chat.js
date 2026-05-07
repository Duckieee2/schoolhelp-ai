export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const keys = [
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY_4,
      process.env.GROQ_API_KEY_5,
    ].filter(Boolean);

    if (!keys.length) {
      return res.status(500).json({ error: 'No API keys set' });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket?.remoteAddress ||
      "unknown";

    // -------------------------
    // GLOBAL RATE LIMIT STATE
    // -------------------------
    if (!globalThis.__rl) {
      globalThis.__rl = {
        ipMap: new Map(),
        keyCooldown: new Map(),
        activeRequests: 0,
      };
    }

    const rl = globalThis.__rl;
    const now = Date.now();

    // -------------------------
    // PER-IP RATE LIMIT (STRONGER)
    // -------------------------
    const last = rl.ipMap.get(ip) || 0;
    const minGap = 2000; // 2s per request per IP

    if (now - last < minGap) {
      return res.status(429).json({ error: "Slow down a bit" });
    }
    rl.ipMap.set(ip, now);

    // -------------------------
    // GLOBAL CONCURRENCY LIMIT
    // -------------------------
    const MAX_CONCURRENT = 6;

    if (rl.activeRequests >= MAX_CONCURRENT) {
      return res.status(429).json({
        error: "Server busy — try again in a moment"
      });
    }

    rl.activeRequests++;

    // -------------------------
    // KEY SELECTION (SMARTER)
    // -------------------------
    let apiKey = null;
    let attempts = 0;

    while (attempts < keys.length) {
      const key = keys[globalThis.__groqKeyIndex % keys.length];
      globalThis.__groqKeyIndex =
        (globalThis.__groqKeyIndex + 1) % keys.length;

      const cooldownUntil = rl.keyCooldown.get(key) || 0;

      if (now > cooldownUntil) {
        apiKey = key;
        break;
      }

      attempts++;
    }

    if (!apiKey) {
      rl.activeRequests--;
      return res.status(429).json({
        error: "All API keys rate-limited — wait a few seconds"
      });
    }

    // -------------------------
    // REQUEST BODY
    // -------------------------
    const body = req.body || {};
    const history = Array.isArray(body.history) ? body.history : [];
    const system = body.system || '';

    if (!history.length) {
      rl.activeRequests--;
      return res.status(400).json({ error: 'Invalid request' });
    }

    if (history.length > 60) {
      rl.activeRequests--;
      return res.status(429).json({
        error: 'Conversation too long — refresh'
      });
    }

    const messages = [
      {
        role: 'system',
        content: system || 'You are a helpful school assistant.'
      },
      ...history.slice(-8).map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: String(msg.parts?.[0]?.text ?? msg.content ?? '').trim()
      }))
    ];

    // -------------------------
    // CALL GROQ
    // -------------------------
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages,
          max_tokens: 1500,
          temperature: 0.7
        })
      }
    );

    const data = await response.json();

    // -------------------------
    // HANDLE RATE LIMIT FROM GROQ
    // -------------------------
    if (response.status === 429) {
      rl.keyCooldown.set(apiKey, now + 5000); // 5s cooldown per key
    }

    rl.activeRequests--;

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'Groq API error'
      });
    }

    return res.status(200).json({
      reply: data?.choices?.[0]?.message?.content || 'No response.'
    });

  } catch (err) {
    if (globalThis.__rl) globalThis.__rl.activeRequests--;
    return res.status(500).json({
      error: 'Server crashed: ' + err.message
    });
  }
}

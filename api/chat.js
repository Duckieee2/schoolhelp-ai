export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const extractText = (msg) => {
    if (typeof msg?.content === "string") return msg.content;
    if (Array.isArray(msg?.parts)) return msg.parts[0]?.text || "";
    return "";
  };

  try {
    const keys = [
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY_4,
      process.env.GROQ_API_KEY_5,
    ].filter(Boolean);

    if (!keys.length) {
      return res.status(500).json({ error: 'No API keys configured' });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket?.remoteAddress ||
      "unknown";

    // ---------------- GLOBAL STATE ----------------
    if (!globalThis.__groqState) {
      globalThis.__groqState = {
        ipMap: new Map(),
        keyCooldown: new Map(),
        activeRequests: 0,
        keyIndex: 0,
      };
    }

    const state = globalThis.__groqState;
    const now = Date.now();

    // ---------------- IP RATE LIMIT ----------------
    const last = state.ipMap.get(ip) || 0;
    const minGap = 2000; // 2 sec per user

    if (now - last < minGap) {
      return res.status(429).json({ error: "Slow down a bit" });
    }

    state.ipMap.set(ip, now);

    // ---------------- GLOBAL CONCURRENCY LIMIT ----------------
    const MAX_CONCURRENT = 6;

    if (state.activeRequests >= MAX_CONCURRENT) {
      return res.status(429).json({
        error: "Server busy — try again in a moment"
      });
    }

    state.activeRequests++;

    // ---------------- INPUT ----------------
    const body = req.body || {};
    const history = Array.isArray(body.history) ? body.history : [];
    const system = body.system || '';

    if (!history.length) {
      state.activeRequests--;
      return res.status(400).json({ error: 'Empty conversation' });
    }

    if (history.length > 60) {
      state.activeRequests--;
      return res.status(429).json({
        error: 'Conversation too long — refresh'
      });
    }

    // ---------------- KEY ROTATION (SMART) ----------------
    const keys = [
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY_4,
      process.env.GROQ_API_KEY_5,
    ].filter(Boolean);

    let apiKey = null;
    let attempts = 0;

    while (attempts < keys.length) {
      const key = keys[state.keyIndex % keys.length];
      state.keyIndex++;

      const cooldown = state.keyCooldown.get(key) || 0;

      if (now > cooldown) {
        apiKey = key;
        break;
      }

      attempts++;
    }

    if (!apiKey) {
      state.activeRequests--;
      return res.status(429).json({
        error: "All API keys are rate-limited — wait a few seconds"
      });
    }

    // ---------------- BUILD MESSAGES ----------------
    const messages = [
      {
        role: 'system',
        content: system || 'You are a helpful school assistant.'
      },
      ...history.slice(-8).map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: extractText(msg).trim()
      }))
    ];

    // ---------------- CALL GROQ ----------------
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
          max_tokens: 1200,
          temperature: 0.7
        })
      }
    );

    const data = await response.json();

    // ---------------- HANDLE GROQ RATE LIMIT ----------------
    if (response.status === 429) {
      state.keyCooldown.set(apiKey, now + 5000);
    }

    state.activeRequests--;

    // ---------------- HARD ERROR HANDLING ----------------
    if (!response.ok) {
      console.error("Groq error:", data);
      return res.status(response.status).json({
        error: data?.error?.message || 'Groq API error',
        debug: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      console.error("Empty Groq response:", data);
      return res.status(500).json({
        error: "Model returned empty response",
        debug: data
      });
    }

    return res.status(200).json({ reply });

  } catch (err) {
    if (globalThis.__groqState) {
      globalThis.__groqState.activeRequests--;
    }

    console.error(err);

    return res.status(500).json({
      error: 'Server error: ' + err.message
    });
  }
}

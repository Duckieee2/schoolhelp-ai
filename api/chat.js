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

    if (keys.length === 0) {
      return res.status(500).json({
        error: 'No GROQ_API_KEY_* keys set in environment variables'
      });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket?.remoteAddress ||
      "unknown";

    // simple in-memory rate limit
    if (!globalThis.__rateLimit) globalThis.__rateLimit = new Map();

    const now = Date.now();
    const last = globalThis.__rateLimit.get(ip) || 0;

    if (now - last < 1500) {
      return res.status(429).json({ error: "Slow down a bit" });
    }

    globalThis.__rateLimit.set(ip, now);

    // round robin key rotation
    if (globalThis.__groqKeyIndex === undefined) globalThis.__groqKeyIndex = 0;

    const apiKey = keys[globalThis.__groqKeyIndex];
    globalThis.__groqKeyIndex =
      (globalThis.__groqKeyIndex + 1) % keys.length;

    const body = req.body || {};
    const history = Array.isArray(body.history) ? body.history : [];
    const system = body.system || '';

    if (history.length === 0) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    if (history.length > 60) {
      return res.status(429).json({
        error: 'Conversation too long — please refresh to start a new one.'
      });
    }

    const lastUserMsg =
      [...history]
        .reverse()
        .find(m => m?.role === 'user')?.parts?.[0]?.text || '';
 });
    }

    const chatHistory = history.slice(-12);

    const needsFreshData = (messages) => {
      const text = JSON.stringify(messages).toLowerCase();
      return (
        text.includes("latest") ||
        text.includes("update") ||
        text.includes("version") ||
        text.includes("current") ||
        text.includes("2026") ||
        text.includes("minecraft") ||
        text.includes("news")
      );
    };

    const getFreshContext = async (query) => {
      if (!query) return null;

      const q = query.toLowerCase();

      if (q.includes("minecraft")) {
        return "Minecraft uses a modern 2026+ version system. Avoid outdated 1.20.x info.";
      }

      return null;
    };

    const messages = [
      {
        role: 'system',
        content: system || 'You are a helpful school assistant.'
      }
    ];

    if (needsFreshData(chatHistory)) {
      const fresh = await getFreshContext(lastUserMsg);

      if (fresh) {
        messages.push({
          role: 'system',
          content: `UP-TO-DATE CONTEXT: ${fresh}`
        });
      }
    }
    
    const cleanHistory = chatHistory
      .filter(msg =>
        msg &&
        (msg.parts?.[0]?.text || msg.content)
      )
      .slice(-8)
    
    messages.push(
      ...cleanHistory.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: String(
          msg.parts?.[0]?.text ??
          msg.content ??
          ''
        ).trim()
      }))
    );

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
          max_tokens: 2000,
          temperature: 0.7
        })
      }
    );

    if (response.status === 429) {
      return res.status(429).json({
        error: 'Too busy right now — try again in a few seconds.'
      });
    }

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'Groq API error'
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content || 'No response.';

    return res.status(200).json({ reply });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Server crashed: ' + err.message
    });
  }
}

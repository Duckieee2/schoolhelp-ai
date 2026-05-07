export default async function handler(req, res) {
  const send = (status, obj) => {
    res.status(status);
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(obj));
  };

  if (req.method !== "POST") {
    return send(405, { error: "Method not allowed" });
  }

  async function callGemini(apiKey, messages) {
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join("\n");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await res.json();

    return data?.candidates?.[0]?.content?.parts?.[0]?.text;
  }

  try {
    const groqKeys = [
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY_4,
      process.env.GROQ_API_KEY_5
    ].filter(Boolean);

    const geminiKeys = [
      process.env.GEMINI_API_KEY_1,
      process.env.GEMINI_API_KEY_2
    ].filter(Boolean);

    if (!groqKeys.length && !geminiKeys.length) {
      return send(500, { error: "No API keys configured" });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket?.remoteAddress ||
      "unknown";

    if (!globalThis.__state) {
      globalThis.__state = {
        ipMap: new Map(),
        keyCooldown: new Map(),
        activeRequests: 0,
        keyIndex: 0
      };
    }

    const state = globalThis.__state;
    const now = Date.now();

    const last = state.ipMap.get(ip) || 0;
    if (now - last < 2000) {
      return send(429, { error: "Slow down a bit" });
    }

    state.ipMap.set(ip, now);

    const MAX = 6;
    if (state.activeRequests >= MAX) {
      return send(429, { error: "Server busy — try again" });
    }

    state.activeRequests++;

    const body = req.body || {};
    const history = Array.isArray(body.history) ? body.history : [];
    const system = body.system || "";

    if (!history.length) {
      state.activeRequests--;
      return send(400, { error: "Empty conversation" });
    }

    const messages = [
      {
        role: "system",
        content: system || "You are a helpful school assistant."
      },
      ...history.slice(-8).map(m => ({
        role: m.role === "model" ? "assistant" : "user",
        content:
          typeof m?.content === "string"
            ? m.content
            : m?.parts?.[0]?.text || ""
      }))
    ];

    const useGemini = Math.random() < 0.3;

    const groqPool = groqKeys;
    const geminiPool = geminiKeys;

    let provider = null;
    let apiKey = null;
    let attempts = 0;

    const pool = useGemini ? geminiPool : groqPool;

    while (attempts < pool.length) {
      const key = pool[state.keyIndex % pool.length];
      state.keyIndex++;

      const cooldown = state.keyCooldown.get(key) || 0;

      if (now > cooldown) {
        apiKey = key;
        provider = useGemini ? "gemini" : "groq";
        break;
      }

      attempts++;
    }

    if (!apiKey) {
      state.activeRequests--;
      return send(429, { error: "All API keys rate-limited — wait" });
    }

    let reply;

    if (provider === "groq") {
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages,
            max_tokens: 1200,
            temperature: 0.7
          })
        }
      );

      const data = await response.json();
      reply = data?.choices?.[0]?.message?.content;

      if (response.status === 429) {
        state.keyCooldown.set(apiKey, now + 5000);
      }
    }

    if (provider === "gemini") {
      reply = await callGemini(apiKey, messages);
    }

    state.activeRequests--;

    if (!reply || reply.trim().length === 0) {
      return send(500, { error: "Empty model response" });
    }

    return send(200, { reply });
  } catch (err) {
    if (globalThis.__state) {
      globalThis.__state.activeRequests--;
    }

    return send(500, { error: "Server error: " + err.message });
  }
}

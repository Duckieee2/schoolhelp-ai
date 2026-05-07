export default async function handler(req, res) {
  const send = (status, obj) => {
    res.status(status);
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(obj));
  };

  if (req.method !== "POST") {
    return send(405, { error: "Method not allowed" });
  }

  // -----------------------------
  // GEMINI CALL
  // -----------------------------
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

  // -----------------------------
  // WEB SEARCH (LIVE KNOWLEDGE)
  // -----------------------------
  async function searchWeb(query) {
    const res = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${process.env.SERP_API_KEY}`
    );

    const data = await res.json();

    const results = data?.organic_results || [];

    return results.slice(0, 5).map(r =>
      `TITLE: ${r.title}\nSNIPPET: ${r.snippet}\nLINK: ${r.link}`
    ).join("\n\n");
  }

  // Decide when to use web
  function shouldUseWeb(text) {
    const t = (text || "").toLowerCase();

    return [
      "latest",
      "news",
      "today",
      "now",
      "update",
      "current",
      "price",
      "who is",
      "what is",
      "2026"
    ].some(k => t.includes(k));
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

    // IP rate limit
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

    // -----------------------------
    // GET LAST USER MESSAGE
    // -----------------------------
    const lastUserMessage =
      history[history.length - 1]?.content || "";

    // -----------------------------
    // LIVE WEB CONTEXT
    // -----------------------------
    let webContext = "";

    try {
      if (shouldUseWeb(lastUserMessage)) {
        webContext = await searchWeb(lastUserMessage);
      }
    } catch (e) {
      webContext = "";
    }

    // -----------------------------
    // FORMAT MESSAGES
    // -----------------------------
    const messages = [
      {
        role: "system",
        content:
          (system || "You are a helpful assistant.") +
          (webContext
            ? "\n\nUse this live web information if relevant:\n\n" + webContext
            : "")
      },
      ...history.slice(-8).map(m => ({
        role: m.role === "model" ? "assistant" : "user",
        content:
          typeof m?.content === "string"
            ? m.content
            : m?.parts?.[0]?.text || ""
      }))
    ];

    // -----------------------------
    // MODEL SELECTION
    // -----------------------------
    const useGemini = Math.random() < 0.3;
    const pool = useGemini ? geminiKeys : groqKeys;

    let provider = null;
    let apiKey = null;

    const key = pool[state.keyIndex % pool.length];
    state.keyIndex++;

    if (!key) {
      state.activeRequests--;
      return send(429, { error: "No available API keys" });
    }

    apiKey = key;
    provider = useGemini ? "gemini" : "groq";

    let reply;

    // -----------------------------
    // GROQ
    // -----------------------------
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
    }

    // -----------------------------
    // GEMINI
    // -----------------------------
    if (provider === "gemini") {
      reply = await callGemini(apiKey, messages);
    }

    state.activeRequests--;

    if (!reply || !reply.trim()) {
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

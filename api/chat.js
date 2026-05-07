export default async function handler(req, res) {
  // ALWAYS return JSON no matter what
  const send = (status, obj) => {
    res.status(status);
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(obj));
  };

  if (req.method !== "POST") {
    return send(405, { error: "Method not allowed" });
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
      return send(500, { error: "No API keys configured" });
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
    if (now - last < 2000) {
      return send(429, { error: "Slow down a bit" });
    }
    state.ipMap.set(ip, now);

    // ---------------- CONCURRENCY LIMIT ----------------
    const MAX = 6;
    if (state.activeRequests >= MAX) {
      return send(429, { error: "Server busy — try again" });
    }

    state.activeRequests++;

    // ---------------- REQUEST BODY ----------------
    const body = req.body || {};
    const history = Array.isArray(body.history) ? body.history : [];
    const system = body.system || "";

    if (!history.length) {
      state.activeRequests--;
      return send(400, { error: "Empty conversation" });
    }

    // ---------------- PICK API KEY ----------------
    const keysList = keys;

    let apiKey = null;
    let attempts = 0;

    while (attempts < keysList.length) {
      const key = keysList[state.keyIndex % keysList.length];
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
      return send(429, {
        error: "All API keys rate-limited — wait"
      });
    }

    // ---------------- BUILD MESSAGES ----------------
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

    // ---------------- CALL GROQ ----------------
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

    let data;

    try {
      data = await response.json();
    } catch (e) {
      const text = await response.text();
      state.activeRequests--;

      console.error("Non-JSON Groq response:", text);

      return send(500, {
        error: "Bad response from Groq",
        raw: text.slice(0, 300)
      });
    }

    // ---------------- HANDLE 429 ----------------
    if (response.status === 429) {
      state.keyCooldown.set(apiKey, now + 5000);
    }

    state.activeRequests--;

    if (!response.ok) {
      return send(response.status, {
        error: data?.error?.message || "Groq API error"
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      console.error("Empty reply:", data);
      return send(500, {
        error: "Empty model response"
      });
    }

    return send(200, { reply });

  } catch (err) {
    if (globalThis.__groqState) {
      globalThis.__groqState.activeRequests--;
    }

    console.error(err);

    return send(500, {
      error: "Server error: " + err.message
    });
  }
}

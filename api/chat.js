export default async function handler(req, res) {
  const send = (status, obj) => {
    res.status(status);
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(obj));
  };

  if (req.method !== "POST") return send(405, { error: "Method not allowed" });

  function msgText(m) {
    if (typeof m?.content === "string" && m.content.trim()) return m.content;
    if (typeof m?.parts?.[0]?.text === "string") return m.parts[0].text;
    return "";
  }

  async function callGroq(apiKey, messages) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
    });

    const data = await r.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  }

  try {
    const groqKeys = [1,2,3,4,5].map(i => process.env[`GROQ_API_KEY_${i}`]).filter(Boolean);

    if (!groqKeys.length) return send(500, { error: "No API keys configured" });

    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "unknown";

    if (!globalThis.__state) {
      globalThis.__state = { ipMap: new Map(), activeRequests: 0, keyIndex: 0 };
    }

    const state = globalThis.__state;
    const now = Date.now();

    if (now - (state.ipMap.get(ip) || 0) < 2000) return send(429, { error: "Slow down a bit" });
    state.ipMap.set(ip, now);

    if (state.activeRequests >= 6) return send(429, { error: "Server busy — try again" });
    state.activeRequests++;

    const body = req.body || {};
    const history = Array.isArray(body.history) ? body.history : [];
    const system = body.system || "You are a helpful assistant.";

    if (!history.length) {
      state.activeRequests--;
      return send(400, { error: "Empty conversation" });
    }

    const lastUserText = msgText(history[history.length - 1]);

    const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const fullSystem = `${system}\n\nToday's date is ${today}. You do not have access to the internet or external sources — if asked, say so honestly.`;

    const messages = [
      { role: "system", content: fullSystem },
      ...history.slice(-8).map(m => ({
        role: m.role === "model" ? "assistant" : "user",
        content: msgText(m)
      }))
    ];

    const key = groqKeys[state.keyIndex % groqKeys.length];
    state.keyIndex++;

    let reply = null;
    try { reply = await callGroq(key, messages); } catch (_) {}

    state.activeRequests--;

    if (!reply) return send(500, { error: "No response from Groq" });

    return send(200, { reply });

  } catch (err) {
    if (globalThis.__state) globalThis.__state.activeRequests--;
    return send(500, { error: "Server error: " + err.message });
  }
}

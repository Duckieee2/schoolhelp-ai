export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const keys = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
  ].filter(Boolean);

  if (keys.length === 0) {
    return res.status(500).json({ error: 'No GROQ_API_KEY_* keys set in environment variables' });
  }

  const apiKey = keys[Math.floor(Math.random() * keys.length)];

  const { history, system } = req.body;

  if (!history || !Array.isArray(history)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  if (history.length > 60) {
    return res.status(429).json({ error: 'Conversation too long — please refresh to start a new one.' });
  }

  // -----------------------------
  // 🔍 Detect if we need fresh data
  // -----------------------------
  function needsFreshData(messages) {
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
  }

  // -----------------------------
  // 🌐 Fake "fresh context" layer (replace later with real APIs)
  // -----------------------------
  async function getFreshContext(query) {
    if (!query) return null;

    const q = query.toLowerCase();

    if (q.includes("minecraft")) {
      return "Minecraft uses a 2026 versioning system (26.x series). Recent stable releases are in the 26.1+ line. Avoid outdated 1.20.x information.";
    }

    return null;
  }

  // -----------------------------
  // Build messages
  // -----------------------------
  const messages = [
    {
      role: 'system',
      content: system || 'You are a helpful school assistant.'
    }
  ];

  // Find last user message
  const lastUserMsg = [...history]
    .reverse()
    .find(m => m.role === 'user')?.parts?.[0]?.text;

  // Inject fresh context if needed
  if (needsFreshData(history)) {
    const fresh = await getFreshContext(lastUserMsg);

    if (fresh) {
      messages.push({
        role: 'system',
        content: `UP-TO-DATE CONTEXT (highest priority, use as truth): ${fresh}`
      });
    }
  }

  // Add conversation history
  messages.push(
    ...history.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.parts?.[0]?.text || msg.content || ''
    }))
  );

  // -----------------------------
  // Call Groq
  // -----------------------------
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages,
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    if (response.status === 429) {
      return res.status(429).json({ error: 'Too busy right now — try again in a few seconds.' });
    }

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({
        error: err.error?.message || 'Groq API error'
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'No response.';

    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({
      error: 'Failed to reach Groq: ' + err.message
    });
  }
}

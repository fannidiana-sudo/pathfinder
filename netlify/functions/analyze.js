/**
 * Pathfinder — analysis generator
 * 1. Verifies the Stripe Checkout session is actually PAID
 * 2. Calls the Anthropic API (key stays server-side)
 * 3. Returns the structured analysis JSON
 *
 * Required environment variables (Netlify → Site settings → Environment variables):
 *   ANTHROPIC_API_KEY     — from https://console.anthropic.com
 *   STRIPE_SECRET_KEY     — from https://dashboard.stripe.com/apikeys (sk_live_... or sk_test_...)
 *   ALLOW_TEST_PAYMENTS   — "true" only while testing; REMOVE before launch
 *
 * No npm dependencies — uses Node's built-in fetch (Netlify runs Node 18+).
 */

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return resp(405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return resp(400, { error: "Invalid JSON" });
  }

  const { session_id, answers, traits, archetype, email } = body;

  if (!session_id || !Array.isArray(answers) || answers.length < 5) {
    return resp(400, { error: "Missing session or answers" });
  }

  /* ---------- 1. Verify payment with Stripe ---------- */
  const isTest =
    process.env.ALLOW_TEST_PAYMENTS === "true" && session_id === "TEST";

  if (!isTest) {
    if (!process.env.STRIPE_SECRET_KEY) {
      return resp(500, { error: "Server not configured (Stripe key missing)" });
    }
    try {
      const sRes = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session_id)}`,
        { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }
      );
      const session = await sRes.json();
      if (!sRes.ok || session.payment_status !== "paid") {
        return resp(402, { error: "Payment not verified. If you were charged, contact us with your receipt." });
      }
      // Optional freshness guard: reject sessions older than 24h
      if (session.created && Date.now() / 1000 - session.created > 86400) {
        return resp(402, { error: "This payment session has expired. Contact us with your receipt." });
      }
    } catch (e) {
      console.error("Stripe verification failed:", e);
      return resp(502, { error: "Could not verify payment. Please try again." });
    }
  }

  /* ---------- 2. Generate the analysis ---------- */
  if (!process.env.ANTHROPIC_API_KEY) {
    return resp(500, { error: "Server not configured (Anthropic key missing)" });
  }

  const qa = answers
    .slice(0, 25) // hard cap, keeps prompt bounded
    .map((a) => `Q: ${String(a.question).slice(0, 300)}\nA: ${String(a.answer).slice(0, 600)}`)
    .join("\n");

  const prompt = `You are an elite career and startup advisor. A person completed a self-discovery quiz.
Their trait scores (higher = stronger): ${JSON.stringify(traits)}.
Their archetype: "${String(archetype).slice(0, 60)}".
Their answers:
${qa}

Write a deeply personal, specific, warm-but-direct analysis. Reference their actual answers (especially the free-text one) so it feels written only for them. Avoid generic advice.

Respond ONLY with valid JSON, no markdown fences, no preamble, exactly this shape:
{"summary": "3-4 sentence personal read of who they are, referencing specific answers",
"strengths": ["...", "...", "..."],
"watchouts": ["...", "..."],
"career_paths": [{"title": "...", "why": "1-2 sentences tied to their answers", "first_step": "one concrete action this week"}, {}, {}],
"business_ideas": [{"title": "...", "why": "1-2 sentences", "first_90_days": "concrete plan in 2 sentences"}, {}],
"one_liner": "a single memorable sentence they'll want to screenshot"}`;

  try {
    const aRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await aRes.json();
    if (!aRes.ok) {
      console.error("Anthropic API error:", JSON.stringify(data));
      return resp(502, { error: "The analysis engine is busy. Please try again in a moment." });
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const clean = text.replace(/```json|```/g, "").trim();
    const report = JSON.parse(clean);

    // Log the lead (visible in Netlify function logs; swap for a real
    // email/CRM integration later — e.g. a Mailerlite/Beehiiv API call here)
    console.log("LEAD:", JSON.stringify({ email, archetype, session_id: isTest ? "TEST" : session_id }));

    return resp(200, report);
  } catch (e) {
    console.error("Generation failed:", e);
    return resp(502, { error: "The analysis engine hiccuped. Your payment is safe — please try again." });
  }
};

function resp(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  // ---- ONLY POST ----
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // ---- BASIC CORS / ORIGIN LOCK (recommended) ----
  // Allow only your site to call this endpoint
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = [
    "https://cestfacileti.com",
    "https://www.cestfacileti.com",
    // Optional: local dev
    "http://localhost:5173",
  ];

  if (origin && !allowedOrigins.includes(origin)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Handle preflight if needed (if you ever call with fetch that triggers it)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  try {
    // ---- REQUIRE JSON ----
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return new Response("Expected JSON", {
        status: 415,
        headers: corsHeaders(origin),
      });
    }

    // Client IP (works on Cloudflare)
    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      "0.0.0.0";

    // ---- RATE LIMIT (FREE) ----
    // 5 requests / 10 minutes per IP
    const cache = caches.default;
    const key = new Request(`https://ratelimit.local/contact/${ip}`, { method: "GET" });

    let hits = 0;
    const cached = await cache.match(key);
    if (cached) hits = parseInt(await cached.text(), 10) || 0;

    if (hits >= 5) {
      return new Response("Too many requests", {
        status: 429,
        headers: corsHeaders(origin),
      });
    }

    // Store next hit count in cache for 10 minutes
    await cache.put(
      key,
      new Response(String(hits + 1), {
        headers: {
          "Cache-Control": "max-age=600", // 10 minutes
        },
      })
    );

    // ---- PARSE BODY ----
    const body = await request.json();
    const {
      name,
      email,
      message,
      website, // honeypot field
      turnstileToken, // token from client
    } = body || {};

    // ---- HONEYPOT (bots often fill hidden fields) ----
    if (website && String(website).trim() !== "") {
      return new Response("OK", { status: 200, headers: corsHeaders(origin) });
      // Return OK so bots don't learn they were caught
    }

    // ---- INPUT VALIDATION ----
    if (!name || !email || !message) {
      return new Response("Invalid input", { status: 400, headers: corsHeaders(origin) });
    }

    if (String(name).length > 80) {
      return new Response("Name too long", { status: 400, headers: corsHeaders(origin) });
    }

    if (String(email).length > 120) {
      return new Response("Email too long", { status: 400, headers: corsHeaders(origin) });
    }

    if (String(message).length > 1000) {
      return new Response("Message too long", { status: 400, headers: corsHeaders(origin) });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email))) {
      return new Response("Invalid email", { status: 400, headers: corsHeaders(origin) });
    }

    // ---- TURNSTILE VERIFY (FREE) ----
    if (!turnstileToken) {
      return new Response("Missing captcha", { status: 400, headers: corsHeaders(origin) });
    }

    const turnstileOK = await verifyTurnstile({
      secret: env.TURNSTILE_SECRET_KEY,
      token: turnstileToken,
      ip,
    });

    if (!turnstileOK) {
      return new Response("Captcha failed", { status: 403, headers: corsHeaders(origin) });
    }

    // ---- ESCAPE HTML SAFELY (don't just strip tags) ----
    const cleanName = escapeHtml(String(name).trim());
    const cleanEmail = escapeHtml(String(email).trim());
    const cleanMessage = escapeHtml(String(message).trim()).replace(/\n/g, "<br/>");

    // ---- SEND EMAIL ----
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Cest Facile TI <noreply@mail.cestfacileti.com>",
        to: "contact@cestfacileti.com",
        subject: `Nouveau message de ${cleanName}`,
        html: `
          <h2>Nouveau message du site</h2>
          <p><strong>Nom:</strong> ${cleanName}</p>
          <p><strong>Email:</strong> ${cleanEmail}</p>
          <p><strong>Message:</strong><br/>${cleanMessage}</p>
        `,
      }),
    });

    if (!resendResp.ok) {
      return new Response("Email error", { status: 500, headers: corsHeaders(origin) });
    }

    return new Response("OK", { status: 200, headers: corsHeaders(origin) });
  } catch (err) {
    return new Response("Error", { status: 500, headers: corsHeaders(request.headers.get("Origin") || "") });
  }
}

// ---------------- helpers ----------------

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "https://cestfacileti.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function verifyTurnstile({ secret, token, ip }) {
  if (!secret) return false;

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  form.append("remoteip", ip);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });

  const data = await resp.json();
  return !!data.success;
}

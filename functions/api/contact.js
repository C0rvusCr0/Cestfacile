export async function onRequest(context) {
  const { request, env } = context;

  const origin = request.headers.get("Origin") || "";

  const isPagesDev = origin.endsWith(".pages.dev");

  const allowedOrigins = [
    "https://cestfacileti.com",
    "https://www.cestfacileti.com",
    "http://localhost:5173",
  ];


  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }


  if (origin && !allowedOrigins.includes(origin) && !isPagesDev) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders(origin) });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders(origin),
    });
  }

  try {
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return new Response("Expected JSON", {
        status: 415,
        headers: corsHeaders(origin),
      });
    }

    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      "0.0.0.0";

    const cache = caches.default;
    const key = new Request(`https://ratelimit.local/contact/${ip}`, { method: "GET" });

    let hits = 0;
    const cached = await cache.match(key);
    if (cached) hits = parseInt(await cached.text(), 10) || 0;

    if (hits >= 20) {
      return new Response("Too many requests", {
        status: 429,
        headers: corsHeaders(origin),
      });
    }

    await cache.put(
      key,
      new Response(String(hits + 1), {
        headers: { "Cache-Control": "max-age=600" },
      })
    );

    // ---- BODY ----
    const body = await request.json();
    const { name, email, message, website, turnstileToken } = body || {};

    if (website && String(website).trim() !== "") {
      return new Response("OK", { status: 200, headers: corsHeaders(origin) });
    }

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

    if (!turnstileToken) {
      return new Response("Missing captcha", { status: 400, headers: corsHeaders(origin) });
    }

    const turnstileOK = await verifyTurnstile({
      secret: env.TURNSTILE_SECRET,
      token: turnstileToken,
      ip,
    });

    if (!turnstileOK) {
      return new Response("Captcha failed", { status: 403, headers: corsHeaders(origin) });
    }

    const cleanName = escapeHtml(String(name).trim());
    const cleanEmail = escapeHtml(String(email).trim());
    const cleanMessage = escapeHtml(String(message).trim()).replace(/\n/g, "<br/>");

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
      const details = await resendResp.text().catch(() => "");
      return new Response(`Email error: ${details}`, {
        status: 500,
        headers: corsHeaders(origin),
      });
    }

    return new Response("OK", { status: 200, headers: corsHeaders(origin) });
  } catch (err) {
    return new Response("Error", { status: 500, headers: corsHeaders(origin) });
  }
}

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

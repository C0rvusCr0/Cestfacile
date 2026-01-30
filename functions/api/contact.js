function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidEmail(email = "") {
  // simple + safe email check (not perfect but good)
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export async function onRequestPost(context) {
  // 1) Method guard
  if (context.request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 2) Content-Type guard (accept json only)
  const contentType = context.request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  // 3) Body size limit (e.g., 10KB)
  const contentLength = Number(context.request.headers.get("content-length") || "0");
  if (contentLength && contentLength > 10_000) {
    return new Response("Payload Too Large", { status: 413 });
  }

  try {
    const data = await context.request.json();

    // Optional honeypot field: add `<input name="website" style="display:none">`
    // If bots fill it => reject.
    const honeypot = (data.website || "").toString().trim();
    if (honeypot.length > 0) {
      return new Response("OK", { status: 200 }); // pretend success to frustrate bots
    }

    const name = (data.name || "").toString().trim();
    const email = (data.email || "").toString().trim().toLowerCase();
    const message = (data.message || "").toString().trim();

    // 4) Validate lengths
    if (name.length < 2 || name.length > 80) {
      return new Response("Invalid name", { status: 400 });
    }
    if (!isValidEmail(email) || email.length > 254) {
      return new Response("Invalid email", { status: 400 });
    }
    if (message.length < 5 || message.length > 2000) {
      return new Response("Invalid message", { status: 400 });
    }

    // 5) Basic spam heuristics (optional but useful)
    const linkCount = (message.match(/https?:\/\//gi) || []).length;
    if (linkCount >= 3) {
      return new Response("Too many links", { status: 400 });
    }

    // 6) Escape HTML so user input can't inject markup into your email
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message).replaceAll("\n", "<br/>");

    // 7) Send email via Resend
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${context.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: "Cest Facile TI <noreply@mail.cestfacileti.com>",
        to: "contact@cestfacileti.com",
        reply_to: email, // IMPORTANT: keeps deliverability good
        subject: `Nouveau message de ${safeName}`,
        html: `
          <h2>Nouveau message du site</h2>
          <p><strong>Nom:</strong> ${safeName}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Message:</strong><br/>${safeMessage}</p>
        `
      })
    });

    if (!resendResp.ok) {
      // Don't leak resend error body publicly
      return new Response("Email failed", { status: 502 });
    }

    return new Response("OK", { status: 200 });
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
}

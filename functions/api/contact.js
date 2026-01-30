export async function onRequestPost(context) {
  try {
    const ip = context.request.headers.get("CF-Connecting-IP");

    // ---- RATE LIMIT (FREE) ----
    const cache = caches.default;
    const key = new Request(`https://ratelimit/${ip}`);

    let hits = 0;
    const cached = await cache.match(key);
    if (cached) {
      hits = parseInt(await cached.text());
    }

    if (hits >= 5) {
      return new Response("Too many requests", { status: 429 });
    }

    await cache.put(key, new Response(String(hits + 1)), {
      expirationTtl: 600 // 10 minutes
    });

    // ---- INPUT VALIDATION ----
    const { name, email, message } = await context.request.json();

    if (!name || !email || !message) {
      return new Response("Invalid input", { status: 400 });
    }

    if (message.length > 1000) {
      return new Response("Message too long", { status: 400 });
    }

    const clean = (str) =>
      str.replace(/<[^>]*>?/gm, "").trim();

    const cleanName = clean(name);
    const cleanEmail = clean(email);
    const cleanMessage = clean(message);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return new Response("Invalid email", { status: 400 });
    }

    // ---- SEND EMAIL ----
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${context.env.RESEND_API_KEY}`
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
        `
      })
    });

    if (!response.ok) {
      return new Response("Error", { status: 500 });
    }

    return new Response("OK");

  } catch {
    return new Response("Error", { status: 500 });
  }
}

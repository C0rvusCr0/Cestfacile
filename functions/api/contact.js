export async function onRequestPost({ request, env }) {
  const { name, email, message } = await request.json();

  if (!name || !email || !message) {
    return new Response("Missing fields", { status: 400 });
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Cestfacile Contact <contact@cestfacile.com>",
      to: ["contact@cestfacile.com"],
      reply_to: email,
      subject: `New contact from ${name}`,
      text: `
Name: ${name}
Email: ${email}

${message}
      `,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return new Response(t, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

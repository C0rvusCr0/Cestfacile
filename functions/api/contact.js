export async function onRequestPost({ request, env }) {
  const { name, email, message } = await request.json();

  if (!name || !email || !message) {
    return new Response("Missing fields", { status: 400 });
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Cestfacile <contact@cestfacile.com>",
      to: ["contact@cestfacile.com"],
      reply_to: email,
      subject: `Nouveau message de ${name}`,
      text: `
Nom: ${name}
Email: ${email}

${message}
      `,
    }),
  });

  if (!resp.ok) {
    return new Response("Email error", { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  try {
    const { name, email, message } = await context.request.json();

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${context.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: "Cest Facile TI <noreply@mail.cestfacileti.com>",
        to: "contact@cestfacileti.com",
        subject: `Nouveau message de ${name}`,
        html: `
          <h2>Nouveau message du site</h2>
          <p><strong>Nom:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Message:</strong><br/>${message}</p>
        `
      })
    });

    const text = await response.text();

    if (!response.ok) {
      return new Response(text, { status: 500 });
    }

    return new Response("OK", { status: 200 });

  } catch (err) {
    return new Response(err.toString(), { status: 500 });
  }
}

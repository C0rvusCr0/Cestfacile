import { SmtpClient } from "npm:smtp-client";

export async function onRequestPost({ request, env }) {
  const { name, email, message } = await request.json();

  if (!name || !email || !message) {
    return new Response("Missing fields", { status: 400 });
  }

  const client = new SmtpClient();

  await client.connect({
    hostname: "mail.privateemail.com",
    port: 587,
    secure: false,
  });

  await client.greet({ hostname: "cestfacile.com" });

  await client.authPlain({
    username: env.SMTP_USER,
    password: env.SMTP_PASS,
  });

  await client.mail({ from: env.SMTP_USER });
  await client.rcpt({ to: env.SMTP_USER });

  await client.dat

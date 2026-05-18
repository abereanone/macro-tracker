import { Resend } from "resend";

export async function onRequestPost(context: any) {
  const resend = new Resend(context.env.RESEND_API_KEY);

  const { to } = await context.request.json();

  const result = await resend.emails.send({
    from: "Macro Tracker <login@macros.michaelcoughlin.net>",
    to,
    subject: "Macro Tracker test email",
    text: "This is a test email from Macro Tracker."
  });

  return Response.json({ ok: true, result });
}
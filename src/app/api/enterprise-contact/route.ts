import { Resend } from "resend";
import { z } from "zod";

const ENTERPRISE_INBOX = "dvargas92495@gmail.com";
const SENDER = "hello@vargasjr.dev";

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  company: z.string().trim().min(1).max(160),
  teamSize: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(4000),
  website: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Please complete all required fields" }, { status: 400 });
  }

  // Quietly accept honeypot submissions so basic bots do not learn the form rejected them.
  if (parsed.data.website) {
    return Response.json({ ok: true });
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: "Email service is not configured" }, { status: 500 });
  }

  const { name, email, company, teamSize, message } = parsed.data;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: SENDER,
    to: [ENTERPRISE_INBOX],
    replyTo: email,
    subject: `Piro enterprise inquiry from ${company}`,
    text: [
      "New Piro enterprise inquiry",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Company: ${company}`,
      `Team size: ${teamSize}`,
      "",
      message,
    ].join("\n"),
  });

  if (error) {
    return Response.json({ error: "Unable to send your message" }, { status: 502 });
  }

  return Response.json({ ok: true });
}

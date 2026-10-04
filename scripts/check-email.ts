import 'dotenv/config';
import { Resend } from 'resend';
import { randomUUID } from 'node:crypto';
if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
  console.error('Configure RESEND_API_KEY and EMAIL_FROM.');
  process.exitCode = 1;
} else {
  // Resend's reserved simulation address does not deliver to a person's inbox.
  const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send(
    {
      from: process.env.EMAIL_FROM,
      to: 'delivered@resend.dev',
      subject: 'Price Atlas sandbox integration check',
      text: 'Price Atlas email integration test. This message contains no user data.',
    },
    { idempotencyKey: `atlas-sandbox/${randomUUID()}` },
  );
  console.log(
    JSON.stringify({ sandbox: true, accepted: !!data, providerError: error?.name || null }),
  );
  if (error) process.exitCode = 1;
}

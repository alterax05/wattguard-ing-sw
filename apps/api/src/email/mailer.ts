/**
 * Email utilities using the Resend HTTP API
 */
import { Resend } from "resend";
import { ADMIN_EMAIL, EMAIL_FROM, PUBLIC_APP_URL, RESEND_API } from "../config/variables";

let resend: Resend | null = null;

/**
 * Get or create the Resend client
 */
function getResend(): Resend {
  if (!resend) {
    resend = new Resend(RESEND_API);
  }
  return resend;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email via Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { error } = await getResend().emails.send({
    from: EMAIL_FROM,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}

/**
 * Send an invite email
 */
export async function sendInviteEmail(
  email: string,
  token: string,
  role: "admin" | "operator"
): Promise<void> {
  const inviteUrl = `${PUBLIC_APP_URL}/accept-invite?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Invito a WattGuard",
    text: `Sei stato invitato a WattGuard come ${role}.\n\nClicca il seguente link per accettare l'invito:\n${inviteUrl}\n\nQuesto invito scadrà tra 7 giorni.`,
    html: `
      <h2>Invito a WattGuard</h2>
      <p>Sei stato invitato a WattGuard come <strong>${role}</strong>.</p>
      <p><a href="${inviteUrl}">Clicca qui per accettare l'invito</a></p>
      <p>Oppure copia questo link nel tuo browser:</p>
      <p>${inviteUrl}</p>
      <p><small>Questo invito scadrà tra 7 giorni.</small></p>
    `,
  });
}

/**
 * Send a password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<void> {
  const resetUrl = `${PUBLIC_APP_URL}/reset-password?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Reset Password - WattGuard",
    text: `Hai richiesto il reset della password per WattGuard.\n\nClicca il seguente link per reimpostare la password:\n${resetUrl}\n\nQuesto link scadrà tra 1 ora.\n\nSe non hai richiesto il reset, ignora questa email.`,
    html: `
      <h2>Reset Password - WattGuard</h2>
      <p>Hai richiesto il reset della password per WattGuard.</p>
      <p><a href="${resetUrl}">Clicca qui per reimpostare la password</a></p>
      <p>Oppure copia questo link nel tuo browser:</p>
      <p>${resetUrl}</p>
      <p><small>Questo link scadrà tra 1 ora.</small></p>
      <p><small>Se non hai richiesto il reset, ignora questa email.</small></p>
    `,
  });
}

/**
 * Verify the Resend configuration by sending a test email
 */
export async function sendTestEmail(to?: string): Promise<void> {
  const recipient = to || ADMIN_EMAIL;

  await sendEmail({
    to: recipient,
    subject: "Test email da WattGuard",
    text: "Questa è una email di test per verificare la configurazione email.",
    html: "<p>Questa è una email di test per verificare la configurazione email.</p>",
  });
}

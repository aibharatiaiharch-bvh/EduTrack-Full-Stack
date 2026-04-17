import nodemailer from 'nodemailer';
import { getSetting } from './settings.js';

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      'Email not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.'
    );
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user, pass },
  });
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const senderName = getSetting('PRINCIPAL_NAME') || 'EduTrack';

  await transporter.sendMail({
    from: `"${senderName}" <${from}>`,
    to: Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
    cc: opts.cc ? (Array.isArray(opts.cc) ? opts.cc.join(', ') : opts.cc) : undefined,
    subject: opts.subject,
    html: opts.html,
    attachments: (opts.attachments || []).map(a => ({
      filename: a.filename,
      content: Buffer.from(a.content, 'utf-8'),
      contentType: a.contentType,
    })),
  });
}

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

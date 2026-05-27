import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

export interface PasswordResetEmailPayload {
  to: string
  resetUrl: string
  locale: 'zh' | 'en'
  expiresInMinutes: number
}

type TestMailer = (payload: PasswordResetEmailPayload) => Promise<void> | void

let testMailer: TestMailer | null = null

export function setPasswordResetMailerForTests(mailer: TestMailer | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Password reset mailer test hook is only available in test.')
  }
  testMailer = mailer
}

export function isPasswordResetMailConfigured(): boolean {
  const hasHost = Boolean(env.SMTP_HOST?.trim())
  const hasPort = Boolean(env.SMTP_PORT)
  const hasFrom = Boolean(env.SMTP_FROM?.trim())
  const hasUser = Boolean(env.SMTP_USER?.trim())
  const hasPass = Boolean(env.SMTP_PASS)
  const authPairIsValid = hasUser === hasPass
  return hasHost && hasPort && hasFrom && authPairIsValid
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildPasswordResetEmail(payload: PasswordResetEmailPayload): { subject: string; text: string; html: string } {
  if (payload.locale === 'en') {
    const subject = 'Reset your IELTS Reading password'
    const text = [
      'You requested a password reset for IELTS Reading Past Papers.',
      `Open this link within ${payload.expiresInMinutes} minutes to set a new password:`,
      payload.resetUrl,
      'If you did not request this, you can ignore this email.'
    ].join('\n\n')
    const html = `
      <p>You requested a password reset for IELTS Reading Past Papers.</p>
      <p><a href="${escapeHtml(payload.resetUrl)}">Set a new password</a></p>
      <p>This link expires in ${payload.expiresInMinutes} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `
    return { subject, text, html }
  }

  const subject = '\u91cd\u7f6e\u4f60\u7684 IELTS Reading \u5bc6\u7801'
  const text = [
    '\u4f60\u6b63\u5728\u4e3a IELTS Reading Past Papers \u8bf7\u6c42\u91cd\u7f6e\u5bc6\u7801\u3002',
    `\u8bf7\u5728 ${payload.expiresInMinutes} \u5206\u949f\u5185\u6253\u5f00\u4e0b\u9762\u7684\u94fe\u63a5\u8bbe\u7f6e\u65b0\u5bc6\u7801\uff1a`,
    payload.resetUrl,
    '\u5982\u679c\u8fd9\u4e0d\u662f\u4f60\u7684\u64cd\u4f5c\uff0c\u53ef\u4ee5\u5ffd\u7565\u8fd9\u5c01\u90ae\u4ef6\u3002'
  ].join('\n\n')
  const html = `
    <p>\u4f60\u6b63\u5728\u4e3a IELTS Reading Past Papers \u8bf7\u6c42\u91cd\u7f6e\u5bc6\u7801\u3002</p>
    <p><a href="${escapeHtml(payload.resetUrl)}">\u8bbe\u7f6e\u65b0\u5bc6\u7801</a></p>
    <p>\u8be5\u94fe\u63a5\u5c06\u5728 ${payload.expiresInMinutes} \u5206\u949f\u540e\u5931\u6548\u3002</p>
    <p>\u5982\u679c\u8fd9\u4e0d\u662f\u4f60\u7684\u64cd\u4f5c\uff0c\u53ef\u4ee5\u5ffd\u7565\u8fd9\u5c01\u90ae\u4ef6\u3002</p>
  `
  return { subject, text, html }
}

export async function sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
  if (testMailer) {
    await testMailer(payload)
    return
  }

  if (!isPasswordResetMailConfigured()) {
    throw new Error('Password reset mail is not configured.')
  }

  const auth = env.SMTP_USER?.trim() && env.SMTP_PASS
    ? {
        user: env.SMTP_USER.trim(),
        pass: env.SMTP_PASS
      }
    : undefined

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth
  })
  const email = buildPasswordResetEmail(payload)

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: payload.to,
    subject: email.subject,
    text: email.text,
    html: email.html
  })
}

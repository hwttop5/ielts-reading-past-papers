import { createHash, randomBytes } from 'node:crypto'

export function createPasswordResetTokenValue(): string {
  return randomBytes(32).toString('base64url')
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

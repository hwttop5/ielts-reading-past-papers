import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(nodeScrypt)
const PASSWORD_KEY_LENGTH = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, salt, hash] = storedHash.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) {
    return false
  }

  const expected = Buffer.from(hash, 'hex')
  const actual = (await scrypt(password, salt, expected.length)) as Buffer
  if (actual.length !== expected.length) {
    return false
  }

  return timingSafeEqual(actual, expected)
}

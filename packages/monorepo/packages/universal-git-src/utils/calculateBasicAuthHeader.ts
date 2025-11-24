import { UniversalBuffer } from './UniversalBuffer.ts'

export function calculateBasicAuthHeader({
  username = '',
  password = '',
}: {
  username?: string
  password?: string
}): string {
  return `Basic ${UniversalBuffer.from(`${username}:${password}`).toString('base64')}`
}


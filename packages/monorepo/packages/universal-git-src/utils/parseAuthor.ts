import type { Author } from "../models/GitCommit.ts"

export const parseAuthor = (author: string): Author => {
  const match = author.match(/^(.*) <(.*)> (.*) (.*)$/)
  if (!match) {
    throw new Error(`Invalid author format: ${author}`)
  }
  const [, name, email, timestamp, offset] = match
  return {
    name,
    email,
    timestamp: Number(timestamp),
    timezoneOffset: parseTimezoneOffset(offset),
  }
}

// The amount of effort that went into crafting these cases to handle
// -0 (just so we don't lose that information when parsing and reconstructing)
// but can also default to +0 was extraordinary.

const parseTimezoneOffset = (offset: string): number => {
  const match = offset.match(/(\+|-)(\d\d)(\d\d)/)
  if (!match) {
    throw new Error(`Invalid timezone offset format: ${offset}`)
  }
  const [, sign, hours, minutes] = match
  const totalMinutes = (sign === '+' ? 1 : -1) * (Number(hours) * 60 + Number(minutes))
  return negateExceptForZero(totalMinutes)
}

const negateExceptForZero = (n: number): number => {
  return n === 0 ? n : -n
}


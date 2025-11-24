import type { Author } from "../models/GitCommit.ts"

export const formatAuthor = ({ name, email, timestamp, timezoneOffset }: Author): string => {
  const formattedOffset = formatTimezoneOffset(timezoneOffset)
  return `${name} <${email}> ${timestamp} ${formattedOffset}`
}

// The amount of effort that went into crafting these cases to handle
// -0 (just so we don't lose that information when parsing and reconstructing)
// but can also default to +0 was extraordinary.

const formatTimezoneOffset = (minutes: number): string => {
  const sign = simpleSign(negateExceptForZero(minutes))
  const absMinutes = Math.abs(minutes)
  const hours = Math.floor(absMinutes / 60)
  const remainingMinutes = absMinutes - hours * 60
  let strHours = String(hours)
  let strMinutes = String(remainingMinutes)
  if (strHours.length < 2) strHours = '0' + strHours
  if (strMinutes.length < 2) strMinutes = '0' + strMinutes
  return (sign === -1 ? '-' : '+') + strHours + strMinutes
}

const simpleSign = (n: number): number => {
  return Math.sign(n) || (Object.is(n, -0) ? -1 : 1)
}

const negateExceptForZero = (n: number): number => {
  return n === 0 ? n : -n
}


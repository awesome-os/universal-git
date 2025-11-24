import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Converts line endings in a buffer based on Git attributes
 */
export const convertLineEndings = (
  buffer: UniversalBuffer | Uint8Array,
  eol: string,
  platform: 'unix' | 'windows' = 'unix'
): UniversalBuffer => {
  if (!UniversalBuffer.isBuffer(buffer)) {
    buffer = UniversalBuffer.from(buffer)
  }

  // If binary or no EOL attribute, return as-is
  if (!eol || eol === 'binary') {
    return UniversalBuffer.from(buffer)
  }

  const content = buffer.toString('utf8')

  // Determine target line ending
  let targetEOL: string
  if (eol === 'lf') {
    targetEOL = '\n'
  } else if (eol === 'crlf') {
    targetEOL = '\r\n'
  } else if (eol === 'auto') {
    // Auto mode: use platform default
    targetEOL = platform === 'windows' ? '\r\n' : '\n'
  } else {
    // Unknown EOL value, return as-is
    return UniversalBuffer.from(buffer)
  }

  // Normalize all line endings to LF first
  let normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Convert to target EOL
  if (targetEOL === '\r\n') {
    normalized = normalized.replace(/\n/g, '\r\n')
  }
  // If target is '\n', it's already normalized

  return UniversalBuffer.from(normalized, 'utf8')
}

/**
 * Normalizes line endings to LF (for storage in Git)
 */
export const normalizeToLF = (buffer: UniversalBuffer | Uint8Array): UniversalBuffer => {
  return convertLineEndings(buffer, 'lf')
}

/**
 * Converts line endings for working directory based on attributes
 */
export const convertForWorkdir = ({
  buffer,
  eol,
  platform = 'unix',
}: {
  buffer: UniversalBuffer | Uint8Array
  eol?: string
  platform?: 'unix' | 'windows'
}): UniversalBuffer => {
  return convertLineEndings(buffer, eol || 'auto', platform)
}

/**
 * Converts line endings for Git storage (always normalize to LF)
 */
export const convertForStorage = ({
  buffer,
  eol,
}: {
  buffer: UniversalBuffer | Uint8Array
  eol?: string
}): UniversalBuffer => {
  // Git always stores files with LF line endings
  return normalizeToLF(buffer)
}


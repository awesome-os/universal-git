import ignore from 'ignore'
import { join } from '../GitPath.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

type AttributeRule = {
  pattern: string
  attributes: Record<string, string | boolean>
}

/**
 * Parses a .gitattributes file and returns attribute rules
 */
export const parse = (content: string): AttributeRule[] => {
  if (!content) return []

  const lines = content.split('\n')
  const rules: AttributeRule[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue

    // Split pattern from attributes
    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) continue

    const pattern = parts[0]
    const attributes: Record<string, string | boolean> = {}

    // Parse attributes (key=value or key)
    for (let i = 1; i < parts.length; i++) {
      const attr = parts[i]
      if (attr.includes('=')) {
        const [key, value] = attr.split('=', 2)
        attributes[key] = value
      } else {
        attributes[attr] = true
      }
    }

    rules.push({ pattern, attributes })
  }

  return rules
}

/**
 * Loads .gitattributes files from the repository
 */
export const loadAttributes = async ({
  fs,
  dir,
  filepath,
}: {
  fs: FileSystemProvider
  dir: string
  filepath: string
}): Promise<Record<string, string | boolean>> => {
  const attributes: Record<string, string | boolean> = {}

  // Handle missing filepath
  if (!filepath) {
    return attributes
  }

  // Find all .gitattributes files that could affect this file
  const pairs: Array<{ gitattributes: string; filepath: string }> = [
    {
      gitattributes: join(dir, '.gitattributes'),
      filepath,
    },
  ]
  const pieces = filepath.split('/').filter(Boolean)
  for (let i = 1; i < pieces.length; i++) {
    const folder = pieces.slice(0, i).join('/')
    const file = pieces.slice(i).join('/')
    pairs.push({
      gitattributes: join(dir, folder, '.gitattributes'),
      filepath: file,
    })
  }

  // Process .gitattributes files from root to file
  for (const p of pairs) {
    let content: string
    try {
      content = (await fs.read(p.gitattributes, 'utf8')) as string
    } catch (err) {
      if ((err as { code?: string }).code === 'NOENT') continue
      throw err
    }

    const rules = parse(content)
    // Use gitignore-style matching to determine if pattern matches
    for (const rule of rules) {
      // Test if the pattern matches this filepath
      // In gitattributes, patterns work like gitignore: if pattern would match/ignore the file,
      // then the attributes apply. So we check if the pattern would ignore the filepath.
      const testPattern = rule.pattern.startsWith('!') ? rule.pattern.slice(1) : rule.pattern
      const testIgn = (ignore as any)().add(testPattern)
      const matches = testIgn.test(p.filepath).ignored

      if (matches) {
        // Merge attributes (later rules override earlier ones)
        Object.assign(attributes, rule.attributes)
      }
    }
  }

  return attributes
}

/**
 * Gets attributes for a specific filepath
 */
export const getAttributes = async ({
  fs,
  dir,
  filepath,
}: {
  fs: FileSystemProvider
  dir: string
  filepath: string
}): Promise<Record<string, string | boolean>> => {
  return loadAttributes({ fs, dir, filepath })
}

/**
 * Checks if a file has a specific attribute
 */
export const hasAttribute = async ({
  fs,
  dir,
  filepath,
  attribute,
}: {
  fs: FileSystemProvider
  dir: string
  filepath: string
  attribute: string
}): Promise<boolean | string> => {
  const attributes = await getAttributes({ fs, dir, filepath })
  return attributes[attribute] || false
}


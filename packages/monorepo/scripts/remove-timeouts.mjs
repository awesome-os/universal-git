import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function findTestFiles(dir, fileList = []) {
  const files = readdirSync(dir)
  for (const file of files) {
    const filePath = join(dir, file)
    const stat = statSync(filePath)
    if (stat.isDirectory()) {
      findTestFiles(filePath, fileList)
    } else if (file.endsWith('.test.ts')) {
      fileList.push(filePath)
    }
  }
  return fileList
}

const TEST_FILES = findTestFiles(join(__dirname, 'tests'))

let updatedCount = 0

for (const file of TEST_FILES) {
  let content = readFileSync(file, 'utf-8')
  const originalContent = content
  let modified = false

  // Skip if no timeout exists
  if (!content.includes('timeout: 60000') && !content.includes('timeout:60000')) {
    continue
  }

  // Pattern 1: describe('name', { timeout: 60000 }, () => { -> describe('name', () => {
  content = content.replace(/describe\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{\s*timeout:\s*60000\s*\}\s*,\s*\(\)\s*=>\s*\{/g, (match, name) => {
    modified = true
    return `describe('${name}', () => {`
  })

  // Pattern 2: describe('name', { timeout: 60000 }, async () => { -> describe('name', async () => {
  content = content.replace(/describe\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{\s*timeout:\s*60000\s*\}\s*,\s*async\s+\(\)\s*=>\s*\{/g, (match, name) => {
    modified = true
    return `describe('${name}', async () => {`
  })

  // Pattern 3: test('name', { timeout: 60000 }, async (t) => { -> test('name', async (t) => {
  content = content.replace(/test\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{\s*timeout:\s*60000\s*\}\s*,\s*(async\s*\([^)]*\)\s*=>\s*\{)/g, (match, name, rest) => {
    modified = true
    return `test('${name}', ${rest}`
  })

  // Pattern 4: describe('name', { ... timeout: 60000 ... }, () => { - remove timeout from options
  // Handle timeout with comma before it
  content = content.replace(/describe\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{([^}]*),\s*timeout:\s*60000\s*([^}]*)\}\s*,\s*\(\)\s*=>\s*\{/g, (match, name, before, after) => {
    modified = true
    const indent = match.match(/^(\s*)/)?.[1] || ''
    const beforeTrim = before.trim()
    const afterTrim = after.trim()
    // Remove trailing comma from before if it exists, or leading comma from after
    const cleanedBefore = beforeTrim.replace(/,\s*$/, '').trim()
    const cleanedAfter = afterTrim.replace(/^\s*,/, '').trim()
    
    if (cleanedBefore && cleanedAfter) {
      return `describe('${name}', {\n${indent}    ${cleanedBefore},\n${indent}    ${cleanedAfter}\n${indent}  }, () => {`
    } else if (cleanedBefore) {
      return `describe('${name}', {\n${indent}    ${cleanedBefore}\n${indent}  }, () => {`
    } else if (cleanedAfter) {
      return `describe('${name}', {\n${indent}    ${cleanedAfter}\n${indent}  }, () => {`
    } else {
      // Only timeout in options, remove the options object entirely
      return `describe('${name}', () => {`
    }
  })

  // Pattern 5: describe('name', { timeout: 60000, ... }, () => { - timeout at start
  content = content.replace(/describe\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{\s*timeout:\s*60000\s*,\s*([^}]*)\}\s*,\s*\(\)\s*=>\s*\{/g, (match, name, rest) => {
    modified = true
    const indent = match.match(/^(\s*)/)?.[1] || ''
    const restTrim = rest.trim()
    if (restTrim) {
      return `describe('${name}', {\n${indent}    ${restTrim}\n${indent}  }, () => {`
    } else {
      return `describe('${name}', () => {`
    }
  })

  // Pattern 6: describe('name', { timeout: 60000 }, async () => { with other options
  content = content.replace(/describe\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{\s*timeout:\s*60000\s*,\s*([^}]*)\}\s*,\s*async\s+\(\)\s*=>\s*\{/g, (match, name, rest) => {
    modified = true
    const indent = match.match(/^(\s*)/)?.[1] || ''
    const restTrim = rest.trim()
    if (restTrim) {
      return `describe('${name}', {\n${indent}    ${restTrim}\n${indent}  }, async () => {`
    } else {
      return `describe('${name}', async () => {`
    }
  })

  // Pattern 7: Handle multiline timeout with proper indentation
  content = content.replace(/describe\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{\s*\n\s*timeout:\s*60000\s*\n\s*\}\s*,\s*\(\)\s*=>\s*\{/g, (match, name) => {
    modified = true
    return `describe('${name}', () => {`
  })

  content = content.replace(/describe\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{\s*\n\s*timeout:\s*60000\s*\n\s*\}\s*,\s*async\s+\(\)\s*=>\s*\{/g, (match, name) => {
    modified = true
    return `describe('${name}', async () => {`
  })

  if (modified && content !== originalContent) {
    writeFileSync(file, content, 'utf-8')
    updatedCount++
    console.log(`Updated: ${file}`)
  }
}

console.log(`\nRemoved timeouts from ${updatedCount} test files.`)


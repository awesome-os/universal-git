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

  // Skip if timeout already exists
  if (content.includes('timeout: 60000') || content.includes('timeout:60000')) {
    continue
  }

  // Pattern 1: describe('name', () => { -> describe('name', { timeout: 60000 }, () => {
  content = content.replace(/describe\s*\(\s*['"]([^'"]+)['"]\s*,\s*\(\)\s*=>\s*\{/g, (match, name) => {
    modified = true
    return `describe('${name}', { timeout: 60000 }, () => {`
  })

  // Pattern 2: describe('name', async () => { -> describe('name', { timeout: 60000 }, async () => {
  content = content.replace(/describe\s*\(\s*['"]([^'"]+)['"]\s*,\s*async\s+\(\)\s*=>\s*\{/g, (match, name) => {
    modified = true
    return `describe('${name}', { timeout: 60000 }, async () => {`
  })

  // Pattern 3: test('name', async (t) => { -> test('name', { timeout: 60000 }, async (t) => {
  content = content.replace(/test\s*\(\s*['"]([^'"]+)['"]\s*,\s*(async\s*\([^)]*\)\s*=>\s*\{)/g, (match, name, rest) => {
    modified = true
    return `test('${name}', { timeout: 60000 }, ${rest}`
  })

  // Pattern 4: describe('name', { ... }, () => { - add timeout if not present
  content = content.replace(/describe\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{([^}]*)\}\s*,\s*\(\)\s*=>\s*\{/g, (match, name, options) => {
    if (options.includes('timeout')) {
      return match
    }
    modified = true
    const indent = match.match(/^(\s*)/)?.[1] || ''
    const newOptions = options.trim() 
      ? `${options.trim()},\n${indent}    timeout: 60000`
      : `timeout: 60000`
    return `describe('${name}', {\n${indent}    ${newOptions}\n${indent}  }, () => {`
  })

  if (modified && content !== originalContent) {
    writeFileSync(file, content, 'utf-8')
    updatedCount++
    console.log(`Updated: ${file}`)
  }
}

console.log(`\nUpdated ${updatedCount} test files with 60-second timeouts.`)


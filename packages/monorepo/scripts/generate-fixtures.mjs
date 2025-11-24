#!/usr/bin/env node
/**
 * Fixture Generation System
 * 
 * Generates test fixtures by analyzing test files and using git CLI commands
 * to build fixtures from scratch.
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { analyzeTests } from './generate-fixtures/analyze-tests.mjs'
import { generateFixture } from './generate-fixtures/generate-fixture.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const FIXTURES_DIR = join(projectRoot, 'tests', '__fixtures__')

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/generate-fixtures.mjs [options]

Options:
  --fixture <name>           Generate specific fixture (e.g., test-merge)
  --object-format <format>   Object format: sha1 or sha256 (default: sha1)
  --all                      Generate all fixtures from test files
  --analyze-only             Just analyze tests without generating
  --validate                 Validate existing fixture integrity (check all objects exist)
  --help, -h                 Show this help message

Examples:
  node scripts/generate-fixtures.mjs --fixture test-merge
  node scripts/generate-fixtures.mjs --fixture test-merge --object-format sha256
  node scripts/generate-fixtures.mjs --analyze-only
  node scripts/generate-fixtures.mjs --validate --fixture test-merge
    `)
    process.exit(0)
  }

  const analyzeOnly = args.includes('--analyze-only')
  const allFixtures = args.includes('--all')
  const validateOnly = args.includes('--validate')
  const fixtureArgIndex = args.indexOf('--fixture')
  const fixtureName = fixtureArgIndex >= 0 && args[fixtureArgIndex + 1] 
    ? args[fixtureArgIndex + 1] 
    : null
  const objectFormatArgIndex = args.indexOf('--object-format')
  const objectFormat = objectFormatArgIndex >= 0 && args[objectFormatArgIndex + 1]
    ? args[objectFormatArgIndex + 1].toLowerCase()
    : 'sha1'
  
  if (objectFormat !== 'sha1' && objectFormat !== 'sha256') {
    console.error(`Error: Invalid object format "${objectFormat}". Must be 'sha1' or 'sha256'`)
    process.exit(1)
  }

  if (!existsSync(FIXTURES_DIR)) {
    console.error(`Fixtures directory not found: ${FIXTURES_DIR}`)
    process.exit(1)
  }

  try {
    if (analyzeOnly) {
      // Just analyze tests
      const testFile = join(projectRoot, 'tests', 'commands', 'merge.test.ts')
      if (existsSync(testFile)) {
        console.log('Analyzing test file:', testFile)
        const definition = await analyzeTests(testFile)
        console.log(JSON.stringify(definition, null, 2))
      } else {
        console.error(`Test file not found: ${testFile}`)
        process.exit(1)
      }
    } else if (validateOnly) {
      // Validate existing fixture
      if (!fixtureName) {
        console.error('Error: --validate requires --fixture <name>')
        process.exit(1)
      }
      const fixturePath = join(FIXTURES_DIR, `${fixtureName}.git`)
      if (!existsSync(fixturePath)) {
        console.error(`Error: Fixture not found: ${fixturePath}`)
        process.exit(1)
      }
      console.log(`Validating fixture: ${fixtureName}`)
      const { validateFixtureIntegrity } = await import('./generate-fixtures/generate-fixture.mjs')
      await validateFixtureIntegrity(fixturePath)
      console.log(`✓ Fixture ${fixtureName} is valid`)
    } else if (fixtureName) {
      // Generate specific fixture
      console.log(`Generating fixture: ${fixtureName} (${objectFormat.toUpperCase()})`)
      await generateFixture(fixtureName, FIXTURES_DIR, objectFormat)
      console.log(`✓ Successfully generated ${fixtureName}`)
    } else if (allFixtures) {
      // Generate all fixtures (future implementation)
      console.log('Generating all fixtures...')
      console.log('(Not yet implemented - use --fixture <name> for now)')
      process.exit(1)
    } else {
      console.error('Error: Must specify --fixture <name>, --all, --analyze-only, or --validate')
      process.exit(1)
    }
  } catch (error) {
    console.error('Error:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})


/**
 * Test Analyzer
 * 
 * Parses test files to extract fixture requirements:
 * - Branches referenced
 * - Expected merge results
 * - File operations
 * - Conflict scenarios
 */

import { readFileSync } from 'fs'

/**
 * Analyze a test file to extract fixture requirements
 * @param {string} testFilePath - Path to the test file
 * @returns {Promise<Object>} Fixture definition
 */
export async function analyzeTests(testFilePath) {
  const content = readFileSync(testFilePath, 'utf-8')
  
  const definition = {
    fixtureName: null,
    branches: new Set(),
    mergeResults: new Set(),
    fileOperations: [],
    conflicts: [],
  }

  // Extract fixture name from makeFixture calls
  const fixtureMatch = content.match(/makeFixture\(['"]([^'"]+)['"]\)/g)
  if (fixtureMatch) {
    const fixtureName = fixtureMatch[0].match(/['"]([^'"]+)['"]/)[1]
    definition.fixtureName = fixtureName
  }

  // Extract branch references from ours/theirs/ref
  const branchPatterns = [
    /ours:\s*['"]([^'"]+)['"]/g,
    /theirs:\s*['"]([^'"]+)['"]/g,
    /ref:\s*['"]([^'"]+)['"]/g,
  ]

  for (const pattern of branchPatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      definition.branches.add(match[1])
    }
  }

  // Extract merge result branches (branches that are expected to exist after merge)
  // Pattern: ref: 'branch-merge-other-branch'
  const mergeResultPattern = /ref:\s*['"]([^'"]+-merge-[^'"]+)['"]/g
  let match
  while ((match = mergeResultPattern.exec(content)) !== null) {
    definition.mergeResults.add(match[1])
  }

  // Also look for branches that end with -merge-* pattern
  for (const branch of definition.branches) {
    if (branch.includes('-merge-')) {
      definition.mergeResults.add(branch)
    }
  }

  // Convert Sets to Arrays for JSON serialization
  return {
    fixtureName: definition.fixtureName,
    branches: Array.from(definition.branches).sort(),
    mergeResults: Array.from(definition.mergeResults).sort(),
    fileOperations: definition.fileOperations,
    conflicts: definition.conflicts,
  }
}


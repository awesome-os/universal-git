#!/usr/bin/env node
/**
 * Profile the merge test to identify performance bottlenecks
 * 
 * Usage:
 *   node scripts/profile-merge-test.mjs
 * 
 * This will run the merge test with profiling enabled and generate a report
 */

import { spawn } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'

const testFile = 'tests/commands/merge.test.ts'
const outputDir = 'profile-results'

console.log('🔍 Profiling merge test...')
console.log('This may take a while...\n')

// Create output directory
try {
  const { mkdirSync } = await import('fs')
  mkdirSync(outputDir, { recursive: true })
} catch {
  // Directory might already exist
}

// Method 1: Node.js built-in profiler
console.log('📊 Running with Node.js built-in profiler...')
const profilerProcess = spawn('node', [
  '--prof',
  '--experimental-strip-types',
  '--test',
  '--test-timeout=20000',
  '--test-concurrency=0',
  testFile
], {
  stdio: 'inherit',
  shell: true
})

profilerProcess.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ Test completed successfully')
    console.log('\n📈 To analyze the profile:')
    console.log('   1. Find the isolate-*.log file in the current directory')
    console.log('   2. Run: node --prof-process isolate-*.log > profile.txt')
    console.log('   3. Open profile.txt to see the performance breakdown')
  } else {
    console.log(`\n❌ Test failed with code ${code}`)
  }
})


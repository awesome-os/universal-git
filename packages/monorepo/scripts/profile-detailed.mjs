#!/usr/bin/env node
/**
 * Detailed profiling of merge test with function-level timing
 * 
 * Usage:
 *   node scripts/profile-detailed.mjs
 * 
 * This uses Node.js --cpu-prof flag to generate a CPU profile
 * that can be viewed in Chrome DevTools
 */

import { spawn } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'

const testFile = 'tests/commands/merge.test.ts'

console.log('🔍 Running merge test with CPU profiling...')
console.log('This will generate a .cpuprofile file that can be opened in Chrome DevTools\n')

const profilerProcess = spawn('node', [
  '--cpu-prof',
  '--cpu-prof-dir=./profile-results',
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
    console.log('\n📈 To analyze the CPU profile:')
    console.log('   1. Open Chrome DevTools (F12)')
    console.log('   2. Go to Performance tab')
    console.log('   3. Click "Load profile" button')
    console.log('   4. Select the .cpuprofile file from ./profile-results/')
    console.log('   5. Analyze the flame graph to see where time is spent')
  } else {
    console.log(`\n❌ Test failed with code ${code}`)
  }
})


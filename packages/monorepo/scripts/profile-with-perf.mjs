#!/usr/bin/env node
/**
 * Profile merge test with detailed timing information
 * 
 * Usage:
 *   node scripts/profile-with-perf.mjs
 */

import { performance } from 'perf_hooks'
import { spawn } from 'child_process'

const testFile = 'tests/commands/merge.test.ts'

console.log('⏱️  Running merge test with performance measurement...\n')

const startTime = performance.now()

const testProcess = spawn('node', [
  '--experimental-strip-types',
  '--test',
  '--test-timeout=20000',
  '--test-concurrency=0',
  '--trace-warnings',
  testFile
], {
  stdio: 'inherit',
  shell: true
})

testProcess.on('close', (code) => {
  const endTime = performance.now()
  const duration = ((endTime - startTime) / 1000).toFixed(2)
  
  console.log(`\n⏱️  Total execution time: ${duration}s`)
  
  if (code === 0) {
    console.log('✅ Test passed')
  } else {
    console.log(`❌ Test failed with code ${code}`)
  }
})


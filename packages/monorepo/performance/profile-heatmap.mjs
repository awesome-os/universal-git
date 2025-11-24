#!/usr/bin/env node
/**
 * Generate CPU profile heat map for performance analysis
 * 
 * Usage:
 *   node performance/profile-heatmap.mjs [test-file]
 * 
 * This will generate a .cpuprofile file that can be opened in Chrome DevTools
 * to see a flame graph/heat map of where time is being spent.
 */

import { spawn } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const testFiles = {
  'merge-add-remove': 'performance/merge-add-remove.test.ts',
  'merge-remove-add': 'performance/merge-remove-add.test.ts',
}

const testFile = process.argv[2] || 'merge-add-remove'
const outputDir = 'performance/results'

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true })
}

if (!testFiles[testFile]) {
  console.error(`❌ Unknown test: ${testFile}`)
  console.error(`   Available tests: ${Object.keys(testFiles).join(', ')}`)
  process.exit(1)
}

const testPath = testFiles[testFile]
const profileFileName = `${testFile}-heatmap-${Date.now()}.cpuprofile`
const profilePath = join(outputDir, profileFileName)

console.log('🔥 Generating CPU Profile Heat Map')
console.log('=' .repeat(60))
console.log(`Test: ${testFile}`)
console.log(`File: ${testPath}`)
console.log(`Output: ${profilePath}`)
console.log('')

const testProcess = spawn('node', [
  '--experimental-strip-types',
  '--test',
  '--test-timeout=60000',
  '--test-concurrency=0',
  '--cpu-prof', // Enable CPU profiler
  `--cpu-prof-dir=${outputDir}`, // Output directory
  `--cpu-prof-name=${profileFileName}`, // Output file name (without path)
  testPath
], {
  stdio: 'inherit',
  shell: true
})

testProcess.on('close', (code) => {
  console.log('')
  console.log('=' .repeat(60))
  if (code === 0) {
    console.log('✅ Test passed')
  } else {
    console.log(`❌ Test failed with code ${code}`)
  }
  console.log('')
  console.log('📊 View Heat Map:')
  console.log('   1. Open Google Chrome')
  console.log('   2. Open DevTools (F12)')
  console.log('   3. Go to "Performance" tab')
  console.log('   4. Click "Load profile..." (up arrow icon)')
  console.log(`   5. Select: ${profilePath}`)
  console.log('   6. Analyze the flame graph to find hot paths')
  console.log('')
  console.log('💡 Tips:')
  console.log('   - Wider bars = more time spent')
  console.log('   - Red/orange = hot paths (CPU intensive)')
  console.log('   - Look for functions called many times')
  console.log('   - Check for unnecessary work in loops')
  console.log('')
})


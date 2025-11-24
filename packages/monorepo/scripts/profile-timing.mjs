#!/usr/bin/env node
/**
 * Profile merge test with detailed timing for each test
 * 
 * Usage:
 *   node scripts/profile-timing.mjs
 */

import { performance } from 'perf_hooks'
import { spawn } from 'child_process'
import { writeFileSync } from 'fs'

const testFile = 'tests/commands/merge.test.ts'

console.log('⏱️  Running merge test with detailed timing...\n')

const timings = []
let currentTest = null
let testStartTime = null

const testProcess = spawn('node', [
  '--experimental-strip-types',
  '--test',
  '--test-timeout=20000',
  '--test-concurrency=0',
  '--test-reporter=spec',
  testFile
], {
  stdio: ['inherit', 'pipe', 'inherit'],
  shell: true
})

let output = ''
testProcess.stdout.on('data', (data) => {
  const text = data.toString()
  output += text
  process.stdout.write(text)
  
  // Parse test timing from output
  // Format: "✔ test name (1234.5678ms)"
  const testMatch = text.match(/[✔✖]\s+(.+?)\s+\((\d+\.?\d*)ms\)/g)
  if (testMatch) {
    testMatch.forEach(match => {
      const parts = match.match(/[✔✖]\s+(.+?)\s+\((\d+\.?\d*)ms\)/)
      if (parts) {
        const testName = parts[1].trim()
        const duration = parseFloat(parts[2])
        timings.push({ name: testName, duration, status: match.includes('✔') ? 'pass' : 'fail' })
      }
    })
  }
})

testProcess.on('close', (code) => {
  console.log('\n' + '='.repeat(80))
  console.log('📊 PERFORMANCE ANALYSIS')
  console.log('='.repeat(80))
  
  // Sort by duration (slowest first)
  timings.sort((a, b) => b.duration - a.duration)
  
  console.log('\n🐌 Slowest tests (>5 seconds):')
  const slowTests = timings.filter(t => t.duration > 5000)
  if (slowTests.length === 0) {
    console.log('   None! All tests are fast.')
  } else {
    slowTests.forEach((test, i) => {
      const seconds = (test.duration / 1000).toFixed(2)
      const status = test.status === 'pass' ? '✅' : '❌'
      console.log(`   ${i + 1}. ${status} ${test.name}: ${seconds}s`)
    })
  }
  
  console.log('\n📈 Summary:')
  const totalTime = timings.reduce((sum, t) => sum + t.duration, 0)
  const avgTime = totalTime / timings.length
  const maxTime = Math.max(...timings.map(t => t.duration))
  const minTime = Math.min(...timings.map(t => t.duration))
  
  console.log(`   Total tests: ${timings.length}`)
  console.log(`   Total time: ${(totalTime / 1000).toFixed(2)}s`)
  console.log(`   Average time: ${(avgTime / 1000).toFixed(2)}s`)
  console.log(`   Fastest test: ${(minTime / 1000).toFixed(2)}s`)
  console.log(`   Slowest test: ${(maxTime / 1000).toFixed(2)}s`)
  
  // Save detailed report
  const report = {
    summary: {
      totalTests: timings.length,
      totalTime: totalTime / 1000,
      averageTime: avgTime / 1000,
      maxTime: maxTime / 1000,
      minTime: minTime / 1000,
    },
    slowTests: slowTests.map(t => ({
      name: t.name,
      duration: t.duration / 1000,
      status: t.status
    })),
    allTests: timings.map(t => ({
      name: t.name,
      duration: t.duration / 1000,
      status: t.status
    }))
  }
  
  writeFileSync('profile-results/merge-test-timing.json', JSON.stringify(report, null, 2))
  console.log('\n💾 Detailed report saved to: profile-results/merge-test-timing.json')
  
  if (code === 0) {
    console.log('\n✅ All tests passed')
  } else {
    console.log(`\n❌ Some tests failed (exit code: ${code})`)
  }
})


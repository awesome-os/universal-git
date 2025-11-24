#!/usr/bin/env node
/**
 * Profile the isolated performance tests with detailed timing
 * 
 * Usage:
 *   node performance/profile-timing.mjs [test-file]
 */

import { performance } from 'perf_hooks'
import { spawn } from 'child_process'

const testFiles = {
  'merge-add-remove': 'performance/merge-add-remove.test.ts',
  'merge-remove-add': 'performance/merge-remove-add.test.ts',
}

const testFile = process.argv[2]

async function profileTestTiming(testName, testPath) {
  console.log(`\n⏱️  Timing: ${testName}`)
  console.log(`   Test file: ${testPath}\n`)

  const startTime = performance.now()

  return new Promise((resolve) => {
    const testProcess = spawn('node', [
      '--experimental-strip-types',
      '--test',
      '--test-timeout=60000',
      '--test-concurrency=0',
      '--test-reporter=spec',
      testPath
    ], {
      stdio: 'inherit',
      shell: true
    })

    testProcess.on('close', (code) => {
      const endTime = performance.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      console.log(`\n⏱️  Total time: ${duration}s`)

      if (code === 0) {
        console.log('✅ Test passed')
      } else {
        console.log(`❌ Test failed with code ${code}`)
      }

      resolve({ testName, duration, passed: code === 0 })
    })
  })
}

async function main() {
  console.log('⏱️  Performance Timing Suite')
  console.log('=' .repeat(50))

  if (testFile) {
    if (!testFiles[testFile]) {
      console.error(`❌ Unknown test: ${testFile}`)
      console.error(`   Available tests: ${Object.keys(testFiles).join(', ')}`)
      process.exit(1)
    }

    await profileTestTiming(testFile, testFiles[testFile])
  } else {
    const results = []
    for (const [name, path] of Object.entries(testFiles)) {
      const result = await profileTestTiming(name, path)
      results.push(result)
    }

    console.log('\n📊 Summary')
    console.log('=' .repeat(50))
    results.forEach(({ testName, duration, passed }) => {
      const status = passed ? '✅' : '❌'
      console.log(`${status} ${testName}: ${duration}s`)
    })
  }
}

main().catch(console.error)


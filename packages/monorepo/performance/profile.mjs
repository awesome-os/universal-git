#!/usr/bin/env node
/**
 * Profile the isolated performance tests
 * 
 * Usage:
 *   node performance/profile.mjs [test-file]
 * 
 * Examples:
 *   node performance/profile.mjs                    # Profile all tests
 *   node performance/profile.mjs merge-add-remove    # Profile specific test
 *   node performance/profile.mjs merge-remove-add   # Profile specific test
 */

import { performance } from 'perf_hooks'
import { spawn } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const testFiles = {
  'merge-add-remove': 'performance/merge-add-remove.test.ts',
  'merge-remove-add': 'performance/merge-remove-add.test.ts',
}

const testFile = process.argv[2]
const outputDir = 'performance/results'

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true })
}

async function profileTest(testName, testPath) {
  console.log(`\n⏱️  Profiling: ${testName}`)
  console.log(`   Test file: ${testPath}\n`)

  const startTime = performance.now()
  const profileFileName = `${testName}-${Date.now()}.cpuprofile`
  const profilePath = join(outputDir, profileFileName)

  return new Promise((resolve) => {
    const testProcess = spawn('node', [
      '--experimental-strip-types',
      '--test',
      '--test-timeout=60000', // 60s timeout for profiling
      '--test-concurrency=0',
      '--cpu-prof',
      `--cpu-prof-name=${profilePath}`,
      testPath
    ], {
      stdio: 'inherit',
      shell: true
    })

    testProcess.on('close', (code) => {
      const endTime = performance.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      console.log(`\n✅ Profiling complete: ${duration}s`)
      console.log(`   Profile saved to: ${profilePath}`)
      console.log(`   Open in Chrome DevTools (Performance tab) to analyze\n`)

      if (code === 0) {
        console.log('✅ Test passed')
      } else {
        console.log(`❌ Test failed with code ${code}`)
      }

      resolve({ testName, duration, profilePath, passed: code === 0 })
    })
  })
}

async function main() {
  console.log('🚀 Performance Profiling Suite')
  console.log('=' .repeat(50))

  if (testFile) {
    // Profile specific test
    if (!testFiles[testFile]) {
      console.error(`❌ Unknown test: ${testFile}`)
      console.error(`   Available tests: ${Object.keys(testFiles).join(', ')}`)
      process.exit(1)
    }

    await profileTest(testFile, testFiles[testFile])
  } else {
    // Profile all tests
    const results = []
    for (const [name, path] of Object.entries(testFiles)) {
      const result = await profileTest(name, path)
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


import { readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

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
const TEST_TIMEOUT = 120000 // 2 minutes per test file
const hangingTests = []
const failedTests = []
const passedTests = []

console.log(`Found ${TEST_FILES.length} test files. Running each independently with ${TEST_TIMEOUT / 1000}s timeout...\n`)
console.log('Press Ctrl+C to stop and see current results\n')

// Allow starting from a specific index (useful for resuming)
const START_INDEX = parseInt(process.env.START_INDEX || '0')

for (let i = START_INDEX; i < TEST_FILES.length; i++) {
  const testFile = TEST_FILES[i]
  const relativePath = testFile.replace(__dirname + '\\', '').replace(__dirname + '/', '')
  
  console.log(`[${i + 1}/${TEST_FILES.length}] Testing: ${relativePath}`)
  
  await new Promise((resolve) => {
    const startTime = Date.now()
    let timedOut = false
    let hasOutput = false
    
    // Spawn the test process
    const testProcess = spawn('node', [
      '--experimental-strip-types',
      '--test',
      '--test-concurrency=1',
      testFile
    ], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    
    let stdout = ''
    let stderr = ''
    
    testProcess.stdout.on('data', (data) => {
      stdout += data.toString()
      hasOutput = true
    })
    
    testProcess.stderr.on('data', (data) => {
      stderr += data.toString()
      hasOutput = true
    })
    
    // Set timeout
    const timeout = setTimeout(() => {
      if (!testProcess.killed) {
        timedOut = true
        testProcess.kill('SIGTERM')
        // Force kill after a short delay
        setTimeout(() => {
          if (!testProcess.killed) {
            testProcess.kill('SIGKILL')
          }
        }, 5000)
      }
    }, TEST_TIMEOUT)
    
    testProcess.on('exit', (code, signal) => {
      clearTimeout(timeout)
      const duration = ((Date.now() - startTime) / 1000).toFixed(2)
      
      if (timedOut) {
        console.log(`  ❌ HANGING TEST (timed out after ${TEST_TIMEOUT / 1000}s)`)
        console.log(`  Last output: ${(stdout + stderr).substring(Math.max(0, (stdout + stderr).length - 300))}`)
        hangingTests.push({
          file: relativePath,
          duration: duration,
          stdout: stdout.substring(Math.max(0, stdout.length - 1000)), // Last 1000 chars
          stderr: stderr.substring(Math.max(0, stderr.length - 1000))
        })
      } else if (code !== 0) {
        console.log(`  ✖ FAILED (exit code: ${code}, signal: ${signal}, duration: ${duration}s)`)
        failedTests.push({
          file: relativePath,
          code: code,
          signal: signal,
          duration: duration,
          stdout: stdout.substring(0, 500),
          stderr: stderr.substring(0, 500)
        })
      } else {
        console.log(`  ✔ PASSED (duration: ${duration}s)`)
        passedTests.push({
          file: relativePath,
          duration: duration
        })
      }
      
      resolve()
    })
    
    testProcess.on('error', (error) => {
      clearTimeout(timeout)
      console.log(`  ✖ ERROR: ${error.message}`)
      failedTests.push({
        file: relativePath,
        error: error.message
      })
      resolve()
    })
  })
  
  // Small delay between tests
  await new Promise(resolve => setTimeout(resolve, 100))
  
  // Save progress periodically
  if ((i + 1) % 10 === 0) {
    console.log(`\n  Progress: ${i + 1}/${TEST_FILES.length} (${((i + 1) / TEST_FILES.length * 100).toFixed(1)}%)`)
    console.log(`  So far: ${passedTests.length} passed, ${failedTests.length} failed, ${hangingTests.length} hanging\n`)
  }
}

// Print summary
console.log('\n' + '='.repeat(80))
console.log('TEST SUMMARY')
console.log('='.repeat(80))
console.log(`Total test files: ${TEST_FILES.length}`)
console.log(`✔ Passed: ${passedTests.length}`)
console.log(`✖ Failed: ${failedTests.length}`)
console.log(`❌ Hanging: ${hangingTests.length}`)
console.log('='.repeat(80))

if (hangingTests.length > 0) {
  console.log('\n❌ HANGING TESTS:')
  console.log('='.repeat(80))
  hangingTests.forEach((test, index) => {
    console.log(`\n${index + 1}. ${test.file}`)
    console.log(`   Duration: ${test.duration}s (timed out)`)
    if (test.stdout) {
      console.log(`   Last stdout: ${test.stdout}`)
    }
    if (test.stderr) {
      console.log(`   Last stderr: ${test.stderr}`)
    }
  })
}

if (failedTests.length > 0) {
  console.log('\n✖ FAILED TESTS:')
  console.log('='.repeat(80))
  failedTests.forEach((test, index) => {
    console.log(`\n${index + 1}. ${test.file}`)
    console.log(`   Exit code: ${test.code}, Signal: ${test.signal}`)
    if (test.stderr) {
      console.log(`   Error: ${test.stderr.substring(0, 200)}`)
    }
  })
}

// Exit with error code if there are hanging or failed tests
if (hangingTests.length > 0 || failedTests.length > 0) {
  process.exit(1)
}


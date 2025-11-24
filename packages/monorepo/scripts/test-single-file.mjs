import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Get test file from command line argument
const testFile = process.argv[2]

if (!testFile) {
  console.error('Usage: node test-single-file.mjs <test-file-path>')
  console.error('Example: node test-single-file.mjs tests/commands/merge.test.ts')
  process.exit(1)
}

const TEST_TIMEOUT = 120000 // 2 minutes
const fullPath = join(__dirname, testFile)

console.log(`Testing: ${testFile}`)
console.log(`Timeout: ${TEST_TIMEOUT / 1000}s\n`)

const startTime = Date.now()
let timedOut = false

const testProcess = spawn('node', [
  '--experimental-strip-types',
  '--test',
  '--test-concurrency=1',
  fullPath
], {
  cwd: __dirname,
  stdio: ['ignore', 'pipe', 'pipe']
})

let stdout = ''
let stderr = ''

testProcess.stdout.on('data', (data) => {
  const text = data.toString()
  stdout += text
  process.stdout.write(text) // Stream output in real-time
})

testProcess.stderr.on('data', (data) => {
  const text = data.toString()
  stderr += text
  process.stderr.write(text) // Stream output in real-time
})

// Set timeout
const timeout = setTimeout(() => {
  if (!testProcess.killed) {
    timedOut = true
    console.log(`\n\n❌ TEST TIMED OUT after ${TEST_TIMEOUT / 1000}s`)
    console.log('Attempting to kill process...')
    testProcess.kill('SIGTERM')
    
    // Force kill after 5 seconds
    setTimeout(() => {
      if (!testProcess.killed) {
        console.log('Force killing process...')
        testProcess.kill('SIGKILL')
      }
    }, 5000)
  }
}, TEST_TIMEOUT)

testProcess.on('exit', (code, signal) => {
  clearTimeout(timeout)
  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  
  console.log('\n' + '='.repeat(80))
  if (timedOut) {
    console.log(`❌ TEST HANGED (timed out after ${TEST_TIMEOUT / 1000}s)`)
    console.log(`Duration: ${duration}s`)
  } else if (code !== 0) {
    console.log(`✖ TEST FAILED`)
    console.log(`Exit code: ${code}, Signal: ${signal}`)
    console.log(`Duration: ${duration}s`)
  } else {
    console.log(`✔ TEST PASSED`)
    console.log(`Duration: ${duration}s`)
  }
  console.log('='.repeat(80))
  
  if (timedOut || code !== 0) {
    if (stderr) {
      console.log('\nSTDERR:')
      console.log(stderr.substring(Math.max(0, stderr.length - 2000)))
    }
    if (stdout) {
      console.log('\nLast STDOUT (last 1000 chars):')
      console.log(stdout.substring(Math.max(0, stdout.length - 1000)))
    }
  }
  
  process.exit(timedOut ? 1 : code || 0)
})

testProcess.on('error', (error) => {
  clearTimeout(timeout)
  console.error(`\n❌ ERROR: ${error.message}`)
  process.exit(1)
})


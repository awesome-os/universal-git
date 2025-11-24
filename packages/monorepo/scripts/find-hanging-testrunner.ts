import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import os from 'os'; // Import the OS module

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findTestFiles(dir, fileList = []) {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      findTestFiles(filePath, fileList);
    } else if (file.endsWith('.test.ts')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

// --- CONFIGURATION ---
const TEST_FILES = findTestFiles(join(__dirname, 'tests'));
const TEST_TIMEOUT = 120000; // 2 minutes per test file
const CONCURRENT_TESTS = Math.max(1, os.cpus().length - 1); // Use all cores but one, or at least 1.
const START_INDEX = parseInt(process.env.START_INDEX || '0');

// --- STATE TRACKING ---
const results = {
  hanging: [],
  failed: [],
  passed: [],
};
let completedTests = 0;
let activeTests = 0;
let testIndex = START_INDEX;

// --- MAIN LOGIC ---
console.log(`Found ${TEST_FILES.length} test files. Running up to ${CONCURRENT_TESTS} in parallel.`);
console.log(`Each test has a ${TEST_TIMEOUT / 1000}s timeout.\n`);
console.log('Press Ctrl+C to stop.\n');

// The main loop to feed the worker pool
function runNextTest() {
  // If all files are scheduled or running, do nothing.
  if (testIndex >= TEST_FILES.length) {
    return;
  }
  
  // Get the next test file and increment the index
  const currentIndex = testIndex;
  const testFile = TEST_FILES[testIndex++];
  
  runTest(testFile, currentIndex);
}

function runTest(testFile: string, index: number) {
  activeTests++;
  const relativePath = testFile.replace(__dirname + '\\', '').replace(__dirname + '/', '');
  
  const startTime = Date.now();
  let timedOut = false;
  
  console.log(`[${index + 1}/${TEST_FILES.length}] STARTING: ${relativePath}`);
  
  const testProcess = spawn('node', [
    '--experimental-strip-types',
    '--test',
    '--test-concurrency=1', // Keep this at 1; parallelism is managed by this script
    testFile
  ], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  testProcess.stdout.on('data', (data) => stdout += data.toString());
  testProcess.stderr.on('data', (data) => stderr += data.toString());

  const timeout = setTimeout(() => {
    timedOut = true;
    testProcess.kill('SIGTERM');
    // Force kill after a short delay
    setTimeout(() => {
      if (!testProcess.killed) {
        testProcess.kill('SIGKILL');
      }
    }, 5000);
  }, TEST_TIMEOUT);

  const onComplete = (result) => {
    clearTimeout(timeout);
    completedTests++;
    activeTests--;

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (timedOut) {
      console.log(`[${index + 1}/${TEST_FILES.length}] ❌ HANGING: ${relativePath} (timed out after ${duration}s)`);
      results.hanging.push({ file: relativePath, duration, stdout, stderr });
    } else if (result.code !== 0) {
      console.log(`[${index + 1}/${TEST_FILES.length}] ✖ FAILED: ${relativePath} (exit code: ${result.code}, duration: ${duration}s)`);
      results.failed.push({ file: relativePath, ...result, duration, stdout, stderr });
    } else {
      console.log(`[${index + 1}/${TEST_FILES.length}] ✔ PASSED: ${relativePath} (duration: ${duration}s)`);
      results.passed.push({ file: relativePath, duration });
    }
    
    // If there are more tests to run, start the next one.
    if (testIndex < TEST_FILES.length) {
      runNextTest();
    } else if (activeTests === 0) {
      // All tests are done
      printSummary();
    }
  };

  testProcess.on('exit', (code, signal) => onComplete({ code, signal }));
  testProcess.on('error', (error) => onComplete({ code: 1, error: error.message }));
}

function printSummary() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total test files: ${TEST_FILES.length}`);
  console.log(`✔ Passed: ${results.passed.length}`);
  console.log(`✖ Failed: ${results.failed.length}`);
  console.log(`❌ Hanging: ${results.hanging.length}`);
  console.log('='.repeat(80));

  if (results.hanging.length > 0) {
    console.log('\n❌ HANGING TESTS:');
    results.hanging.forEach((test) => {
      console.log(`\n- ${test.file}`);
      console.log(`  Last 500 chars of output:\n  ${(test.stdout + test.stderr).slice(-500).replace(/\n/g, '\n  ')}`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\n✖ FAILED TESTS:');
    results.failed.forEach((test) => {
      console.log(`\n- ${test.file} (Exit code: ${test.code})`);
      if (test.stderr) {
        console.log(`  Stderr:\n  ${test.stderr.substring(0, 500).replace(/\n/g, '\n  ')}`);
      }
    });
  }

  if (results.hanging.length > 0 || results.failed.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// --- SCRIPT START ---
// Kick off the initial batch of tests
for (let i = 0; i < CONCURRENT_TESTS && i < TEST_FILES.length; i++) {
  runNextTest();
}
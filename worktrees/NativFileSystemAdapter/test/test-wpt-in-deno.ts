import 'https://wpt.live/resources/testharness.js'
import 'https://wpt.live/FileAPI/support/send-file-formdata-helper.js?expose=kTestChars&expose=formDataPostFileUploadTest'
import * as fs from '../src/es6.js'
import {cleanupSandboxedFileSystem} from './util.js';

const { getOriginPrivateDirectory } = fs
const deno = await getOriginPrivateDirectory(import('../src/adapters/deno.js'), 'testfolder')
const memory = await getOriginPrivateDirectory(import('../src/adapters/memory.js'))

Deno.removeSync('testfolder', {recursive: true})
Deno.mkdir('testfolder')

// globalThis.self = globalThis

setup({
  explicit_timeout: true,
  explicit_done: true,
})

globalThis.add_result_callback((test: any) => {
  const INDENT_SIZE = 2;

  const reporter = {
    startSuite: (name: string) => console.log(`\n  ${(name)}\n`),
    pass: (message: string) => console.log((indent(("√ ") + message.replace(/(\r\n|\n|\r)/gm, ''), INDENT_SIZE))),
    fail: (message: string) => console.log((indent("× " + message, INDENT_SIZE))),
    reportStack: (stack: string) => console.log((indent(stack, INDENT_SIZE * 2))),
  }

  const skip = [
    'truncate() fails when parent directory is removed',
    'write() fails when parent directory is removed',
    'atomic writes: writable file stream persists file on close, even if file is removed',
    'atomic writes: close() fails when parent directory is removed',
    'atomic writes: writable file streams make atomic changes on close',
    'createWritable({keepExistingData: false}): atomic writable file stream initialized with empty file',
    // Seems only spec to memory adapter?
    'write() with an invalid blob to an empty file should reject',
    'removeEntry() while the file has an open writable succeeds'
  ]

  if (skip.includes(test.name)) return

  function indent(string: string, times: number): string {
    const prefix = " ".repeat(times);
    return string.split("\n").map(l => prefix + l).join("\n");
  }

  if (test.status === 0) {
    reporter.pass(test.name);
  } else if (test.status === 1) {
    reporter.fail(`${test.name}\n`);
    reporter.reportStack(`${test.message}\n${test.stack}`);
  } else if (test.status === 2) {
    reporter.fail(`${test.name} (timeout)\n`);
    reporter.reportStack(`${test.message}\n${test.stack}`);
  } else if (test.status === 3) {
    reporter.fail(`${test.name} (incomplete)\n`);
    reporter.reportStack(`${test.message}\n${test.stack}`);
  } else if (test.status === 4) {
    reporter.fail(`${test.name} (precondition failed)\n`);
    reporter.reportStack(`${test.message}\n${test.stack}`);
  } else {
    reporter.fail(`unknown test status: ${test.status}`);
  }
  // hasFailed && process.exit(1);
})

/**********************************************************/
/*                      TEST HELPERS                      */
/**********************************************************/
import('https://wpt.live/streams/resources/recording-streams.js')
// A special path component meaning "this directory."
globalThis.kCurrentDirectory = '.';

// A special path component meaning "the parent directory."
globalThis.kParentDirectory = '..';

// Array of separators used to separate components in hierarchical paths.
globalThis.kPathSeparators = ['/'];

async function getFileSize(handle: any): Promise<number> {
  const file = await handle.getFile();
  return file.size;
}

async function getFileContents(handle: any): Promise<string> {
  const file = await handle.getFile();
  return new Response(file).text();
}

async function getDirectoryEntryCount(handle: any): Promise<number> {
  let result = 0;
  for await (let entry of handle) {
    result++;
  }
  return result;
}

async function getSortedDirectoryEntries(handle: any): Promise<string[]> {
  let result: string[] = [];
  for await (let entry of handle.values()) {
    if (entry.kind === 'directory')
      result.push(entry.name + '/');
    else
      result.push(entry.name);
  }
  result.sort();
  return result;
}

async function createDirectory(test: any, name: string, parent: any): Promise<any> {
  const new_dir_handle = await parent.getDirectoryHandle(name, {create: true});
  test.add_cleanup(async () => {
    try {
      await parent.removeEntry(name, {recursive: true});
    } catch (e) {
      // Ignore any errors when removing directories, as tests might
      // have already removed the directory.
    }
  });
  return new_dir_handle;
}

async function createEmptyFile(test: any, name: string, parent: any): Promise<any> {
  const handle = await parent.getFileHandle(name, {create: true});
  test.add_cleanup(async () => {
    try {
      await parent.removeEntry(name);
    } catch (e) {
      // Ignore any errors when removing files, as tests might already remove
      // the file.
    }
  });
  // Make sure the file is empty.
  assert_equals(await getFileSize(handle), 0);
  return handle;
}

async function createFileWithContents(test: any, name: string, contents: string, parent: any): Promise<any> {
  const handle = await createEmptyFile(test, name, parent);
  const writer = await handle.createWritable();
  await writer.write(new Blob([contents]));
  await writer.close();
  return handle;
}

function sync_access_handle_test(test: any, description: string): void {
  promise_test(async t => {
    // To be extra resilient against bad tests, cleanup before every test.
    await cleanupSandboxedFileSystem(deno);
    const fileHandle = await deno.getFileHandle('OPFS.test', {create: true});
    const syncHandle = await fileHandle.createSyncAccessHandle();
    await test(t, syncHandle);
    await syncHandle.close();
  }, description);
}

globalThis.sync_access_handle_test = sync_access_handle_test
globalThis.directory_test = directory_test
globalThis.createFileWithContents = createFileWithContents
globalThis.createEmptyFile = createEmptyFile
globalThis.createDirectory = createDirectory
globalThis.getSortedDirectoryEntries = getSortedDirectoryEntries
globalThis.getDirectoryEntryCount = getDirectoryEntryCount
globalThis.getFileContents = getFileContents
globalThis.getFileSize = getFileSize
globalThis.garbageCollect = () => {}
Object.assign(globalThis, fs)

function directory_test(func: (t: any, root: any) => Promise<void>, description: string): void {
  promise_test(async t => {
    // To be extra resilient against bad tests, cleanup before every test.
    await cleanupSandboxedFileSystem(deno);
    await func(t, deno).catch(err => {
      console.log(err.message)
      throw err;
    });
  }, description);
}

await import('https://wpt.live/file-system-access/script-tests/FileSystemDirectoryHandle-removeEntry.js')

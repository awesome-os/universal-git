import { test } from 'node:test';
import assert from 'node:assert';
import { GitBaseHandle } from '../handles/GitBaseHandle.ts';
import { MockFileHandle, MockDirectoryHandle } from './helpers/mockProvider.ts';

// Create a concrete implementation for testing
class TestHandle extends GitBaseHandle<MockFileHandle> {
  constructor(rawHandle: MockFileHandle) {
    super(rawHandle);
  }
}

test('ok:base-handle-constructor', () => {
  const rawHandle = new MockFileHandle('test.txt');
  const handle = new TestHandle(rawHandle);
  
  assert.strictEqual(handle['rawHandle'], rawHandle);
});

test('ok:base-handle-kind', () => {
  const fileHandle = new MockFileHandle('test.txt');
  const dirHandle = new MockDirectoryHandle('test');
  
  const fileWrapper = new TestHandle(fileHandle);
  assert.strictEqual(fileWrapper.kind, 'file');
  
  // For directory, we'd need a different wrapper class
  // but the pattern is the same
});

test('ok:base-handle-name', () => {
  const rawHandle = new MockFileHandle('test.txt');
  const handle = new TestHandle(rawHandle);
  
  assert.strictEqual(handle.name, 'test.txt');
});

test('ok:base-handle-is-same-entry-with-wrapper', async () => {
  const rawHandle1 = new MockFileHandle('test.txt');
  const rawHandle2 = new MockFileHandle('test.txt');
  const handle1 = new TestHandle(rawHandle1);
  const handle2 = new TestHandle(rawHandle2);
  
  rawHandle1.isSameEntry = async (other: any) => other === rawHandle2;
  
  const result = await handle1.isSameEntry(handle2);
  assert.strictEqual(result, true);
});

test('ok:base-handle-is-same-entry-with-raw-handle', async () => {
  const rawHandle1 = new MockFileHandle('test.txt');
  const rawHandle2 = new MockFileHandle('test.txt');
  const handle1 = new TestHandle(rawHandle1);
  
  rawHandle1.isSameEntry = async (other: any) => other === rawHandle2;
  
  const result = await handle1.isSameEntry(rawHandle2);
  assert.strictEqual(result, true);
});

test('ok:base-handle-native-accessor', () => {
  const rawHandle = new MockFileHandle('test.txt');
  const handle = new TestHandle(rawHandle);
  
  assert.strictEqual(handle.native, rawHandle);
});

test('ok:base-handle-protected-raw-handle', () => {
  const rawHandle = new MockFileHandle('test.txt');
  const handle = new TestHandle(rawHandle);
  
  // rawHandle is protected, but we can access it via the native getter
  assert.strictEqual(handle.native, rawHandle);
});

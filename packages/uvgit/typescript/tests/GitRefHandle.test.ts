import { test } from 'node:test';
import assert from 'node:assert';
import { GitRefHandle } from '../handles/GitRefHandle.ts';
import { GitDir } from '../GitDir.ts';
import { MockFileHandle, MockDirectoryHandle } from './helpers/mockProvider.ts';
import { GitBaseHandle } from '../handles/GitBaseHandle.ts';
import type { FileSystemFileHandle } from '@awesome-os/native-file-system-adapter-src';

test('ok:ref-handle-constructor', () => {
  const rawHandle = new MockFileHandle('main') as unknown as FileSystemFileHandle;
  const gitDir = new GitDir();
  const refHandle = new GitRefHandle(rawHandle, gitDir);
  
  assert.strictEqual(refHandle.kind, 'file');
  assert.strictEqual(refHandle.name, 'main');
  assert.strictEqual(refHandle['context'], gitDir);
});

test('ok:ref-handle-get-file', async () => {
  const rawHandle = new MockFileHandle('main') as unknown as FileSystemFileHandle;
  const gitDir = new GitDir();
  const refHandle = new GitRefHandle(rawHandle, gitDir);
  
  // Mock the getFile method
  const mockFile = new File(['abc123\n'], 'main');
  rawHandle.getFile = async () => mockFile;
  
  const file = await refHandle.getFile();
  assert.strictEqual(file, mockFile);
});

test('ok:ref-handle-read-oid', async () => {
  const rawHandle = new MockFileHandle('main') as unknown as FileSystemFileHandle;
  const gitDir = new GitDir();
  const refHandle = new GitRefHandle(rawHandle, gitDir);
  
  const oid = '1234567890abcdef1234567890abcdef12345678';
  const mockFile = new File([oid + '\n'], 'main');
  rawHandle.getFile = async () => mockFile;
  
  const result = await refHandle.readOid();
  assert.strictEqual(result, oid);
});

test('ok:ref-handle-read-oid-trims-whitespace', async () => {
  const rawHandle = new MockFileHandle('main') as unknown as FileSystemFileHandle;
  const gitDir = new GitDir();
  const refHandle = new GitRefHandle(rawHandle, gitDir);
  
  const oid = '1234567890abcdef1234567890abcdef12345678';
  const mockFile = new File(['  ' + oid + '  \n'], 'main');
  rawHandle.getFile = async () => mockFile;
  
  const result = await refHandle.readOid();
  assert.strictEqual(result, oid);
});

test('ok:ref-handle-resolve-symbolic-ref', async () => {
  const rawHandle = new MockFileHandle('HEAD') as unknown as FileSystemFileHandle;
  const gitDir = new GitDir();
  const refHandle = new GitRefHandle(rawHandle, gitDir);
  
  const targetRef = 'refs/heads/main';
  const mockFile = new File(['ref: ' + targetRef + '\n'], 'HEAD');
  rawHandle.getFile = async () => mockFile;
  
  const targetHandle = new MockFileHandle('main') as unknown as FileSystemFileHandle;
  gitDir.resolve = async (path: string) => {
    if (path === targetRef) return targetHandle as any;
    return null;
  };
  
  const result = await refHandle.resolve();
  assert.strictEqual(result, targetHandle);
});

test('ok:ref-handle-resolve-direct-oid', async () => {
  const rawHandle = new MockFileHandle('main') as unknown as FileSystemFileHandle;
  const gitDir = new GitDir();
  const refHandle = new GitRefHandle(rawHandle, gitDir);
  
  const oid = '1234567890abcdef1234567890abcdef12345678';
  const mockFile = new File([oid + '\n'], 'main');
  rawHandle.getFile = async () => mockFile;
  
  const objectHandle = new MockFileHandle('object') as unknown as FileSystemFileHandle;
  gitDir.resolve = async (path: string) => {
    if (path === 'objects/12/34567890abcdef1234567890abcdef12345678') return objectHandle as any;
    return null;
  };
  
  const result = await refHandle.resolve();
  assert.strictEqual(result, objectHandle);
});

test('ok:ref-handle-resolve-invalid-oid', async () => {
  const rawHandle = new MockFileHandle('main') as unknown as FileSystemFileHandle;
  const gitDir = new GitDir();
  const refHandle = new GitRefHandle(rawHandle, gitDir);
  
  const mockFile = new File(['invalid-oid\n'], 'main');
  rawHandle.getFile = async () => mockFile;
  
  const result = await refHandle.resolve();
  assert.strictEqual(result, null);
});

test('ok:ref-handle-update-oid', async () => {
  const rawHandle = new MockFileHandle('main') as unknown as FileSystemFileHandle;
  const gitDir = new GitDir();
  const refHandle = new GitRefHandle(rawHandle, gitDir);
  
  const oid = '1234567890abcdef1234567890abcdef12345678';
  let writtenData: Uint8Array | null = null;
  
  const mockWritable = {
    write: async (data: Uint8Array) => {
      writtenData = data;
    },
    close: async () => {},
  };
  
  rawHandle.createWritable = async () => mockWritable as any;
  
  await refHandle.updateOid(oid);
  
  assert.ok(writtenData !== null);
  const text = new TextDecoder().decode(writtenData!);
  assert.strictEqual(text, oid + '\n');
});

test('ok:ref-handle-update-oid-invalid-format', async () => {
  const rawHandle = new MockFileHandle('main') as unknown as FileSystemFileHandle;
  const gitDir = new GitDir();
  const refHandle = new GitRefHandle(rawHandle, gitDir);
  
  await assert.rejects(
    async () => await refHandle.updateOid('invalid'),
    /Invalid OID format/
  );
});

test('ok:ref-handle-update-symbolic-ref', async () => {
  const rawHandle = new MockFileHandle('HEAD') as unknown as FileSystemFileHandle;
  const gitDir = new GitDir();
  const refHandle = new GitRefHandle(rawHandle, gitDir);
  
  const targetRef = 'refs/heads/main';
  let writtenData: Uint8Array | null = null;
  
  const mockWritable = {
    write: async (data: Uint8Array) => {
      writtenData = data;
    },
    close: async () => {},
  };
  
  rawHandle.createWritable = async () => mockWritable as any;
  
  await refHandle.updateSymbolicRef(targetRef);
  
  assert.ok(writtenData !== null);
  const text = new TextDecoder().decode(writtenData!);
  assert.strictEqual(text, 'ref: ' + targetRef + '\n');
});

test('ok:ref-handle-is-same-entry', async () => {
  const rawHandle1 = new MockFileHandle('main') as unknown as FileSystemFileHandle;
  const rawHandle2 = new MockFileHandle('main') as unknown as FileSystemFileHandle;
  const gitDir = new GitDir();
  const refHandle1 = new GitRefHandle(rawHandle1, gitDir);
  const refHandle2 = new GitRefHandle(rawHandle2, gitDir);
  
  rawHandle1.isSameEntry = async (other: any) => other === rawHandle2;
  
  const result = await refHandle1.isSameEntry(refHandle2 as any);
  assert.strictEqual(result, true);
});

test('ok:ref-handle-extends-base-handle', () => {
  const rawHandle = new MockFileHandle('main') as unknown as FileSystemFileHandle;
  const gitDir = new GitDir();
  const refHandle = new GitRefHandle(rawHandle, gitDir);
  
  assert.ok(refHandle instanceof GitBaseHandle);
  assert.strictEqual(refHandle.native, rawHandle);
});

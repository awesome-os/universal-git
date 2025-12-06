import { test } from 'node:test';
import assert from 'node:assert';
import { VirtualRefHandle } from '../handles/VirtualRefHandle.ts';

test('ok:virtual-ref-handle-constructor', () => {
  const handle = new VirtualRefHandle('refs/heads/main', 'abc123');
  
  assert.strictEqual(handle.kind, 'file');
  assert.strictEqual(handle.name, 'refs/heads/main');
  assert.strictEqual(handle['oid'], 'abc123');
});

test('ok:virtual-ref-handle-get-file', async () => {
  const oid = '1234567890abcdef1234567890abcdef12345678';
  const handle = new VirtualRefHandle('refs/heads/main', oid);
  
  const file = await handle.getFile();
  assert.ok(file instanceof File);
  assert.strictEqual(file.name, 'refs/heads/main');
  
  const content = await file.text();
  assert.strictEqual(content, oid + '\n');
});

test('ok:virtual-ref-handle-read-oid', async () => {
  const oid = '1234567890abcdef1234567890abcdef12345678';
  const handle = new VirtualRefHandle('refs/heads/main', oid);
  
  const result = await handle.readOid();
  assert.strictEqual(result, oid);
});

test('ok:virtual-ref-handle-create-writable-throws', async () => {
  const handle = new VirtualRefHandle('refs/heads/main', 'abc123');
  
  await assert.rejects(
    async () => await handle.createWritable(),
    /Cannot write directly to a packed ref/
  );
});

test('ok:virtual-ref-handle-is-same-entry-same-handle', async () => {
  const oid = 'abc123';
  const handle1 = new VirtualRefHandle('refs/heads/main', oid);
  const handle2 = new VirtualRefHandle('refs/heads/main', oid);
  
  const result = await handle1.isSameEntry(handle2);
  assert.strictEqual(result, true);
});

test('ok:virtual-ref-handle-is-same-entry-different-name', async () => {
  const oid = 'abc123';
  const handle1 = new VirtualRefHandle('refs/heads/main', oid);
  const handle2 = new VirtualRefHandle('refs/heads/other', oid);
  
  const result = await handle1.isSameEntry(handle2);
  assert.strictEqual(result, false);
});

test('ok:virtual-ref-handle-is-same-entry-different-oid', async () => {
  const handle1 = new VirtualRefHandle('refs/heads/main', 'abc123');
  const handle2 = new VirtualRefHandle('refs/heads/main', 'def456');
  
  const result = await handle1.isSameEntry(handle2);
  assert.strictEqual(result, false);
});

test('ok:virtual-ref-handle-is-same-entry-non-virtual', async () => {
  const handle = new VirtualRefHandle('refs/heads/main', 'abc123');
  const otherHandle = { kind: 'file', name: 'other' } as any;
  
  const result = await handle.isSameEntry(otherHandle);
  assert.strictEqual(result, false);
});

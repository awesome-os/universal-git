import { test } from 'node:test';
import assert from 'node:assert';
import { GitDirNamespaceProvider } from '../providers/GitDirNamespaceProvider.ts';
import { GitDir } from '../GitDir.ts';
import { MockProvider, MockFileHandle, MockDirectoryHandle } from './helpers/mockProvider.ts';

test('ok:namespace-provider-constructor', () => {
  const baseProvider = new MockProvider('');
  const namespaceProvider = new GitDirNamespaceProvider(baseProvider, 'my-namespace');
  
  assert.strictEqual(namespaceProvider.mountPoint, '');
  assert.strictEqual(namespaceProvider.getNamespace(), 'my-namespace');
  assert.strictEqual(namespaceProvider.getBaseProvider(), baseProvider);
});

test('ok:namespace-provider-translate-refs', async () => {
  const baseProvider = new MockProvider('');
  const namespaceProvider = new GitDirNamespaceProvider(baseProvider, 'my-ns');
  const gitDir = new GitDir();
  
  const expectedHandle = new MockFileHandle('main');
  baseProvider.registerHandle(['refs', 'namespaces', 'my-ns', 'refs', 'heads', 'main'], expectedHandle);
  
  const result = await namespaceProvider.getHandle(['refs', 'heads', 'main'], gitDir);
  assert.strictEqual(result, expectedHandle);
});

test('ok:namespace-provider-pass-through-objects', async () => {
  const baseProvider = new MockProvider('');
  const namespaceProvider = new GitDirNamespaceProvider(baseProvider, 'my-ns');
  const gitDir = new GitDir();
  
  const expectedHandle = new MockFileHandle('object');
  baseProvider.registerHandle(['objects', 'ab', '1234'], expectedHandle);
  
  const result = await namespaceProvider.getHandle(['objects', 'ab', '1234'], gitDir);
  assert.strictEqual(result, expectedHandle);
});

test('ok:namespace-provider-pass-through-head', async () => {
  const baseProvider = new MockProvider('');
  const namespaceProvider = new GitDirNamespaceProvider(baseProvider, 'my-ns');
  const gitDir = new GitDir();
  
  const expectedHandle = new MockFileHandle('HEAD');
  baseProvider.registerHandle(['HEAD'], expectedHandle);
  
  const result = await namespaceProvider.getHandle(['HEAD'], gitDir);
  assert.strictEqual(result, expectedHandle);
});

test('ok:namespace-provider-empty-segments', async () => {
  const baseProvider = new MockProvider('');
  const namespaceProvider = new GitDirNamespaceProvider(baseProvider, 'my-ns');
  const gitDir = new GitDir();
  
  const expectedHandle = new MockDirectoryHandle('root');
  baseProvider.registerHandle([], expectedHandle);
  
  const result = await namespaceProvider.getHandle([], gitDir);
  assert.strictEqual(result, expectedHandle);
});

test('ok:namespace-provider-translate-ref-path', () => {
  const baseProvider = new MockProvider('');
  const namespaceProvider = new GitDirNamespaceProvider(baseProvider, 'my-namespace');
  
  const translated = namespaceProvider.translateRefPath('refs/heads/main');
  assert.strictEqual(translated, 'refs/namespaces/my-namespace/refs/heads/main');
});

test('ok:namespace-provider-translate-ref-path-non-ref', () => {
  const baseProvider = new MockProvider('');
  const namespaceProvider = new GitDirNamespaceProvider(baseProvider, 'my-namespace');
  
  const translated = namespaceProvider.translateRefPath('HEAD');
  assert.strictEqual(translated, 'HEAD');
});

test('ok:namespace-provider-untranslate-ref-path', () => {
  const baseProvider = new MockProvider('');
  const namespaceProvider = new GitDirNamespaceProvider(baseProvider, 'my-namespace');
  
  const untranslated = namespaceProvider.untranslateRefPath('refs/namespaces/my-namespace/refs/heads/main');
  assert.strictEqual(untranslated, 'refs/heads/main');
});

test('ok:namespace-provider-untranslate-non-namespaced', () => {
  const baseProvider = new MockProvider('');
  const namespaceProvider = new GitDirNamespaceProvider(baseProvider, 'my-namespace');
  
  const untranslated = namespaceProvider.untranslateRefPath('refs/heads/main');
  assert.strictEqual(untranslated, null);
});

test('ok:namespace-provider-untranslate-wrong-namespace', () => {
  const baseProvider = new MockProvider('');
  const namespaceProvider = new GitDirNamespaceProvider(baseProvider, 'my-namespace');
  
  const untranslated = namespaceProvider.untranslateRefPath('refs/namespaces/other-namespace/refs/heads/main');
  assert.strictEqual(untranslated, null);
});

test('ok:namespace-provider-init-delegates', async () => {
  const baseProvider = new MockProvider('');
  const namespaceProvider = new GitDirNamespaceProvider(baseProvider, 'my-ns');
  
  await namespaceProvider.init();
  
  assert.strictEqual(baseProvider.initCallCount, 1);
});

test('ok:namespace-provider-init-no-base-init', async () => {
  // Create a provider without init method
  const baseProvider = {
    mountPoint: '',
    getHandle: async () => null,
  };
  
  const namespaceProvider = new GitDirNamespaceProvider(baseProvider as any, 'my-ns');
  
  // Should not throw
  await namespaceProvider.init();
});

import { test } from 'node:test';
import assert from 'node:assert';
import { GitDirFsProvider } from '../providers/GitDirFsProvider.ts';
import { GitDir } from '../GitDir.ts';
import { MockDirectoryHandle, MockFileHandle } from './helpers/mockProvider.ts';
import { GitRefHandle } from '../handles/GitRefHandle.ts';
import { GitLooseObjectHandle } from '../handles/GitLooseObjectHandle.ts';
import { GitPackHandle } from '../handles/GitPackHandle.ts';
import { GitPackIndexHandle } from '../handles/GitPackIndexHandle.ts';

test('ok:fs-provider-constructor', () => {
  const rootHandle = new MockDirectoryHandle('root');
  const provider = new GitDirFsProvider('', rootHandle);
  
  assert.strictEqual(provider.mountPoint, '');
  assert.strictEqual(provider['rootHandle'], rootHandle);
});

test('ok:fs-provider-mount-point', () => {
  const rootHandle = new MockDirectoryHandle('root');
  const provider = new GitDirFsProvider('refs', rootHandle);
  
  assert.strictEqual(provider.mountPoint, 'refs');
});

test('ok:fs-provider-resolve-file', async () => {
  const rootHandle = new MockDirectoryHandle('root');
  const fileHandle = new MockFileHandle('test.txt');
  rootHandle.registerFile('test.txt', fileHandle);
  
  const gitDir = new GitDir();
  const provider = new GitDirFsProvider('', rootHandle);
  gitDir.mount(provider);
  
  const result = await provider.getHandle(['test.txt'], gitDir);
  assert.strictEqual(result, fileHandle);
});

test('ok:fs-provider-resolve-directory', async () => {
  const rootHandle = new MockDirectoryHandle('root');
  const subDirHandle = new MockDirectoryHandle('subdir');
  rootHandle.registerDirectory('subdir', subDirHandle);
  
  const gitDir = new GitDir();
  const provider = new GitDirFsProvider('', rootHandle);
  gitDir.mount(provider);
  
  const result = await provider.getHandle(['subdir'], gitDir);
  assert.strictEqual(result, subDirHandle);
});

test('ok:fs-provider-resolve-nested-path', async () => {
  const rootHandle = new MockDirectoryHandle('root');
  const refsHandle = new MockDirectoryHandle('refs');
  const headsHandle = new MockDirectoryHandle('heads');
  const mainFile = new MockFileHandle('main');
  
  rootHandle.registerDirectory('refs', refsHandle);
  refsHandle.registerDirectory('heads', headsHandle);
  headsHandle.registerFile('main', mainFile);
  
  const gitDir = new GitDir();
  const provider = new GitDirFsProvider('', rootHandle);
  gitDir.mount(provider);
  
  const result = await provider.getHandle(['refs', 'heads', 'main'], gitDir);
  assert.ok(result instanceof GitRefHandle);
});

test('ok:fs-provider-resolve-not-found', async () => {
  const rootHandle = new MockDirectoryHandle('root');
  
  const gitDir = new GitDir();
  const provider = new GitDirFsProvider('', rootHandle);
  gitDir.mount(provider);
  
  const result = await provider.getHandle(['nonexistent'], gitDir);
  assert.strictEqual(result, null);
});

test('ok:fs-provider-wrap-ref-handle', async () => {
  const rootHandle = new MockDirectoryHandle('root');
  const refsHandle = new MockDirectoryHandle('refs');
  const mainFile = new MockFileHandle('main');
  
  rootHandle.registerDirectory('refs', refsHandle);
  refsHandle.registerFile('main', mainFile);
  
  const gitDir = new GitDir();
  const provider = new GitDirFsProvider('', rootHandle);
  gitDir.mount(provider);
  
  const result = await provider.getHandle(['refs', 'main'], gitDir);
  assert.ok(result instanceof GitRefHandle);
  assert.strictEqual(result.name, 'main');
});

test('ok:fs-provider-wrap-ref-handle-mount-point', async () => {
  const refsHandle = new MockDirectoryHandle('refs');
  const mainFile = new MockFileHandle('main');
  
  refsHandle.registerFile('main', mainFile);
  
  const gitDir = new GitDir();
  const provider = new GitDirFsProvider('refs', refsHandle);
  gitDir.mount(provider);
  
  const result = await provider.getHandle(['main'], gitDir);
  assert.ok(result instanceof GitRefHandle);
});

test('ok:fs-provider-wrap-loose-object-handle', async () => {
  const rootHandle = new MockDirectoryHandle('root');
  const objectsHandle = new MockDirectoryHandle('objects');
  const abHandle = new MockDirectoryHandle('ab');
  const objectFile = new MockFileHandle('1234567890abcdef1234567890abcdef12345678');
  
  rootHandle.registerDirectory('objects', objectsHandle);
  objectsHandle.registerDirectory('ab', abHandle);
  abHandle.registerFile('1234567890abcdef1234567890abcdef12345678', objectFile);
  
  const gitDir = new GitDir();
  const provider = new GitDirFsProvider('', rootHandle);
  gitDir.mount(provider);
  
  const result = await provider.getHandle(['objects', 'ab', '1234567890abcdef1234567890abcdef12345678'], gitDir);
  assert.ok(result instanceof GitLooseObjectHandle);
});

test('ok:fs-provider-wrap-loose-object-mount-point', async () => {
  const objectsHandle = new MockDirectoryHandle('objects');
  const abHandle = new MockDirectoryHandle('ab');
  const objectFile = new MockFileHandle('1234567890abcdef1234567890abcdef12345678');
  
  objectsHandle.registerDirectory('ab', abHandle);
  abHandle.registerFile('1234567890abcdef1234567890abcdef12345678', objectFile);
  
  const gitDir = new GitDir();
  const provider = new GitDirFsProvider('objects', objectsHandle);
  gitDir.mount(provider);
  
  const result = await provider.getHandle(['ab', '1234567890abcdef1234567890abcdef12345678'], gitDir);
  assert.ok(result instanceof GitLooseObjectHandle);
});

test('ok:fs-provider-wrap-pack-handle', async () => {
  const rootHandle = new MockDirectoryHandle('root');
  const packDir = new MockDirectoryHandle('pack');
  const packFile = new MockFileHandle('pack-1234567890abcdef1234567890abcdef12345678.pack');
  
  rootHandle.registerDirectory('pack', packDir);
  packDir.registerFile('pack-1234567890abcdef1234567890abcdef12345678.pack', packFile);
  
  const gitDir = new GitDir();
  const provider = new GitDirFsProvider('', rootHandle);
  gitDir.mount(provider);
  
  const result = await provider.getHandle(['pack', 'pack-1234567890abcdef1234567890abcdef12345678.pack'], gitDir);
  assert.ok(result instanceof GitPackHandle);
});

test('ok:fs-provider-wrap-pack-index-handle', async () => {
  const rootHandle = new MockDirectoryHandle('root');
  const packDir = new MockDirectoryHandle('pack');
  const indexFile = new MockFileHandle('pack-1234567890abcdef1234567890abcdef12345678.idx');
  
  rootHandle.registerDirectory('pack', packDir);
  packDir.registerFile('pack-1234567890abcdef1234567890abcdef12345678.idx', indexFile);
  
  const gitDir = new GitDir();
  const provider = new GitDirFsProvider('', rootHandle);
  gitDir.mount(provider);
  
  const result = await provider.getHandle(['pack', 'pack-1234567890abcdef1234567890abcdef12345678.idx'], gitDir);
  assert.ok(result instanceof GitPackIndexHandle);
});

test('ok:fs-provider-return-raw-handle-for-other-files', async () => {
  const rootHandle = new MockDirectoryHandle('root');
  const configFile = new MockFileHandle('config');
  
  rootHandle.registerFile('config', configFile);
  
  const gitDir = new GitDir();
  const provider = new GitDirFsProvider('', rootHandle);
  gitDir.mount(provider);
  
  const result = await provider.getHandle(['config'], gitDir);
  assert.strictEqual(result, configFile);
  assert.ok(!(result instanceof GitRefHandle));
});

test('ok:fs-provider-init-no-op', async () => {
  const rootHandle = new MockDirectoryHandle('root');
  const provider = new GitDirFsProvider('', rootHandle);
  
  // Should not throw
  await provider.init();
});

test('ok:fs-provider-path-through-non-directory', async () => {
  const rootHandle = new MockDirectoryHandle('root');
  const fileHandle = new MockFileHandle('file.txt');
  
  rootHandle.registerFile('file.txt', fileHandle);
  
  const gitDir = new GitDir();
  const provider = new GitDirFsProvider('', rootHandle);
  gitDir.mount(provider);
  
  // Try to resolve a path through a file (should fail)
  const result = await provider.getHandle(['file.txt', 'subpath'], gitDir);
  assert.strictEqual(result, null);
});

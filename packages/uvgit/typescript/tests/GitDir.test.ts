/**
 * Tests for GitDir class
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { GitDir } from '../GitDir.ts';
import { MockProvider, MockFileHandle, MockDirectoryHandle } from './helpers/mockProvider.ts';

test('ok:mount-provider', () => {
  const gitDir = new GitDir();
  const provider = new MockProvider('');

  gitDir.mount(provider);

  assert.strictEqual(gitDir.getProviders().length, 1);
  assert.strictEqual(gitDir.getProviders()[0], provider);
  assert.strictEqual(gitDir.hasProvider(''), true);
  assert.strictEqual(gitDir.getProvider(''), provider);
});

test('ok:mount-multiple-providers', () => {
  const gitDir = new GitDir();
  const rootProvider = new MockProvider('');
  const refsProvider = new MockProvider('refs');
  const objectsProvider = new MockProvider('objects');

  gitDir.mount(rootProvider);
  gitDir.mount(refsProvider);
  gitDir.mount(objectsProvider);

  assert.strictEqual(gitDir.getProviders().length, 3);
  assert.strictEqual(gitDir.hasProvider(''), true);
  assert.strictEqual(gitDir.hasProvider('refs'), true);
  assert.strictEqual(gitDir.hasProvider('objects'), true);
  assert.strictEqual(gitDir.getMountPoints().length, 3);
  assert.deepStrictEqual(gitDir.getMountPoints().sort(), ['', 'objects', 'refs']);
});

test('ok:mount-order-preserved', () => {
  const gitDir = new GitDir();
  const provider1 = new MockProvider('refs');
  const provider2 = new MockProvider('objects');
  const provider3 = new MockProvider('hooks');

  gitDir.mount(provider1);
  gitDir.mount(provider2);
  gitDir.mount(provider3);

  const providers = gitDir.getProviders();
  assert.strictEqual(providers[0], provider1);
  assert.strictEqual(providers[1], provider2);
  assert.strictEqual(providers[2], provider3);
});

test('ok:mount-replaces-existing', () => {
  const gitDir = new GitDir();
  const provider1 = new MockProvider('refs');
  const provider2 = new MockProvider('refs');

  gitDir.mount(provider1);
  assert.strictEqual(gitDir.getProviders().length, 1);
  assert.strictEqual(gitDir.getProvider('refs'), provider1);

  gitDir.mount(provider2);
  assert.strictEqual(gitDir.getProviders().length, 1);
  assert.strictEqual(gitDir.getProvider('refs'), provider2);
  assert.notStrictEqual(gitDir.getProvider('refs'), provider1);
});

test('ok:unmount-provider', () => {
  const gitDir = new GitDir();
  const provider = new MockProvider('refs');

  gitDir.mount(provider);
  assert.strictEqual(gitDir.hasProvider('refs'), true);

  gitDir.unmount(provider);
  assert.strictEqual(gitDir.hasProvider('refs'), false);
  assert.strictEqual(gitDir.getProviders().length, 0);
  assert.strictEqual(gitDir.getProvider('refs'), undefined);
});

test('ok:unmount-by-mount-point', () => {
  const gitDir = new GitDir();
  const provider = new MockProvider('refs');

  gitDir.mount(provider);
  assert.strictEqual(gitDir.hasProvider('refs'), true);

  gitDir.unmountByMountPoint('refs');
  assert.strictEqual(gitDir.hasProvider('refs'), false);
  assert.strictEqual(gitDir.getProviders().length, 0);
});

test('ok:unmount-non-existent-provider', () => {
  const gitDir = new GitDir();
  const provider = new MockProvider('refs');
  const otherProvider = new MockProvider('objects');

  gitDir.mount(provider);
  gitDir.unmount(otherProvider); // Should not throw

  assert.strictEqual(gitDir.hasProvider('refs'), true);
  assert.strictEqual(gitDir.getProviders().length, 1);
});

test('ok:unmount-by-mount-point-non-existent', () => {
  const gitDir = new GitDir();
  
  // Should not throw
  gitDir.unmountByMountPoint('nonexistent');
  
  assert.strictEqual(gitDir.getProviders().length, 0);
});

test('ok:get-provider-by-mount-point', () => {
  const gitDir = new GitDir();
  const rootProvider = new MockProvider('');
  const refsProvider = new MockProvider('refs');

  gitDir.mount(rootProvider);
  gitDir.mount(refsProvider);

  assert.strictEqual(gitDir.getProvider(''), rootProvider);
  assert.strictEqual(gitDir.getProvider('refs'), refsProvider);
  assert.strictEqual(gitDir.getProvider('nonexistent'), undefined);
});

test('ok:has-provider', () => {
  const gitDir = new GitDir();
  const provider = new MockProvider('refs');

  assert.strictEqual(gitDir.hasProvider('refs'), false);
  
  gitDir.mount(provider);
  assert.strictEqual(gitDir.hasProvider('refs'), true);
  
  gitDir.unmount(provider);
  assert.strictEqual(gitDir.hasProvider('refs'), false);
});

test('ok:get-mount-points', () => {
  const gitDir = new GitDir();
  
  assert.deepStrictEqual(gitDir.getMountPoints(), []);

  gitDir.mount(new MockProvider(''));
  gitDir.mount(new MockProvider('refs'));
  gitDir.mount(new MockProvider('objects'));

  const mountPoints = gitDir.getMountPoints();
  assert.strictEqual(mountPoints.length, 3);
  assert.ok(mountPoints.includes(''));
  assert.ok(mountPoints.includes('refs'));
  assert.ok(mountPoints.includes('objects'));
});

test('ok:resolve-path-root-provider', async () => {
  const gitDir = new GitDir();
  const provider = new MockProvider('');
  const handle = new MockFileHandle('HEAD');
  
  provider.registerHandle(['HEAD'], handle);
  gitDir.mount(provider);

  const result = await gitDir.resolve('HEAD');
  assert.strictEqual(result, handle);
});

test('ok:resolve-path-with-mount-point', async () => {
  const gitDir = new GitDir();
  const refsProvider = new MockProvider('refs');
  const handle = new MockFileHandle('main');
  
  refsProvider.registerHandle(['heads', 'main'], handle);
  gitDir.mount(refsProvider);

  const result = await gitDir.resolve('refs/heads/main');
  assert.strictEqual(result, handle);
});

test('ok:resolve-path-normalizes-git-prefix', async () => {
  const gitDir = new GitDir();
  const provider = new MockProvider('');
  const handle = new MockFileHandle('HEAD');
  
  provider.registerHandle(['HEAD'], handle);
  gitDir.mount(provider);

  const result = await gitDir.resolve('.git/HEAD');
  assert.strictEqual(result, handle);
});

test('ok:resolve-path-not-found', async () => {
  const gitDir = new GitDir();
  const provider = new MockProvider('');
  
  gitDir.mount(provider);

  const result = await gitDir.resolve('nonexistent');
  assert.strictEqual(result, null);
});

test('ok:resolve-path-multiple-providers-order', async () => {
  const gitDir = new GitDir();
  const rootProvider = new MockProvider('');
  const refsProvider = new MockProvider('refs');
  
  // Both providers could handle 'refs', but refsProvider should be checked first
  const rootHandle = new MockFileHandle('refs-root');
  const refsHandle = new MockFileHandle('refs-specific');
  
  rootProvider.registerHandle(['refs'], rootHandle);
  refsProvider.registerHandle([], refsHandle);
  
  gitDir.mount(rootProvider);
  gitDir.mount(refsProvider);

  // When resolving 'refs', it should match refsProvider first
  const result = await gitDir.resolve('refs');
  // Since refsProvider has mountPoint 'refs', it gets the path segments []
  // and should return refsHandle
  assert.strictEqual(result, refsHandle);
});

test('ok:resolve-head-fast-lookup', async () => {
  const gitDir = new GitDir();
  const rootProvider = new MockProvider('');
  const otherProvider = new MockProvider('refs');
  const handle = new MockFileHandle('HEAD');
  
  rootProvider.registerHandle(['HEAD'], handle);
  gitDir.mount(rootProvider);
  gitDir.mount(otherProvider);

  const result = await gitDir.resolve('HEAD');
  assert.strictEqual(result, handle);
});

test('ok:resolve-head-with-segments', async () => {
  const gitDir = new GitDir();
  const rootProvider = new MockProvider('');
  const handle = new MockFileHandle('HEAD');
  
  rootProvider.registerHandle(['HEAD'], handle);
  gitDir.mount(rootProvider);

  const result = await gitDir.resolve('HEAD');
  assert.strictEqual(result, handle);
});

test('ok:resolve-deep-mount-point', async () => {
  const gitDir = new GitDir();
  const headsProvider = new MockProvider('refs/heads');
  const handle = new MockFileHandle('main');
  
  headsProvider.registerHandle(['main'], handle);
  gitDir.mount(headsProvider);

  const result = await gitDir.resolve('refs/heads/main');
  assert.strictEqual(result, handle);
});

test('ok:init-calls-provider-init', async () => {
  const gitDir = new GitDir();
  const provider1 = new MockProvider('');
  const provider2 = new MockProvider('refs');

  gitDir.mount(provider1);
  gitDir.mount(provider2);

  await gitDir.init();

  assert.strictEqual(provider1.initCallCount, 1);
  assert.strictEqual(provider2.initCallCount, 1);
});

test('ok:init-preserves-order', async () => {
  const gitDir = new GitDir();
  const provider1 = new MockProvider('');
  const provider2 = new MockProvider('refs');
  const provider3 = new MockProvider('objects');

  gitDir.mount(provider1);
  gitDir.mount(provider2);
  gitDir.mount(provider3);

  await gitDir.init();

  // All should be initialized
  assert.strictEqual(provider1.initCallCount, 1);
  assert.strictEqual(provider2.initCallCount, 1);
  assert.strictEqual(provider3.initCallCount, 1);
});

test('ok:get-providers-readonly', () => {
  const gitDir = new GitDir();
  const provider = new MockProvider('refs');

  gitDir.mount(provider);
  const providers = gitDir.getProviders();

  // Should be readonly
  assert.throws(() => {
    (providers as any).push(new MockProvider('objects'));
  }, TypeError);
});

test('ok:mount-unmount-consistency', () => {
  const gitDir = new GitDir();
  const provider1 = new MockProvider('refs');
  const provider2 = new MockProvider('objects');

  gitDir.mount(provider1);
  gitDir.mount(provider2);

  assert.strictEqual(gitDir.getProviders().length, 2);
  assert.strictEqual(gitDir.getMountPoints().length, 2);

  gitDir.unmount(provider1);

  assert.strictEqual(gitDir.getProviders().length, 1);
  assert.strictEqual(gitDir.getMountPoints().length, 1);
  assert.strictEqual(gitDir.hasProvider('refs'), false);
  assert.strictEqual(gitDir.hasProvider('objects'), true);
});

test('ok:resolve-empty-path', async () => {
  const gitDir = new GitDir();
  const provider = new MockProvider('');
  const handle = new MockDirectoryHandle('root');
  
  provider.registerHandle([], handle);
  gitDir.mount(provider);

  const result = await gitDir.resolve('');
  assert.strictEqual(result, handle);
});

test('ok:resolve-path-with-trailing-slash', async () => {
  const gitDir = new GitDir();
  const provider = new MockProvider('');
  const handle = new MockFileHandle('HEAD');
  
  provider.registerHandle(['HEAD'], handle);
  gitDir.mount(provider);

  const result = await gitDir.resolve('HEAD/');
  assert.strictEqual(result, handle);
});

test('ok:resolve-path-with-multiple-slashes', async () => {
  const gitDir = new GitDir();
  const provider = new MockProvider('refs');
  const handle = new MockFileHandle('main');
  
  provider.registerHandle(['heads', 'main'], handle);
  gitDir.mount(provider);

  const result = await gitDir.resolve('refs//heads///main');
  assert.strictEqual(result, handle);
});

test('ok:mount-replace-maintains-order', () => {
  const gitDir = new GitDir();
  const provider1 = new MockProvider('refs');
  const provider2 = new MockProvider('objects');
  const provider3 = new MockProvider('refs'); // Replace provider1

  gitDir.mount(provider1);
  gitDir.mount(provider2);
  gitDir.mount(provider3); // Should replace provider1 but maintain position

  const providers = gitDir.getProviders();
  assert.strictEqual(providers.length, 2);
  assert.strictEqual(providers[0], provider3); // Replaced provider1
  assert.strictEqual(providers[1], provider2);
});

test('ok:unmount-wrong-provider-same-mount-point', () => {
  const gitDir = new GitDir();
  const provider1 = new MockProvider('refs');
  const provider2 = new MockProvider('refs');

  gitDir.mount(provider1);
  gitDir.unmount(provider2); // Different instance, same mount point

  // Should still have provider1
  assert.strictEqual(gitDir.hasProvider('refs'), true);
  assert.strictEqual(gitDir.getProvider('refs'), provider1);
});

import { test } from 'node:test';
import assert from 'node:assert';
import { SparseCheckoutManager } from '../utils/SparseCheckoutManager.ts';
import { MockFileHandle } from './helpers/mockProvider.ts';

test('ok:sparse-checkout-from-patterns-cone-mode', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src', 'docs'], 'cone');
  
  assert.strictEqual(manager.getMode(), 'cone');
  assert.strictEqual(manager.isEnabled(), true);
  
  const directories = manager.getDirectories();
  assert.ok(directories.includes('src'));
  assert.ok(directories.includes('docs'));
});

test('ok:sparse-checkout-from-patterns-no-cone-mode', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src/**', '*.md'], 'no-cone');
  
  assert.strictEqual(manager.getMode(), 'no-cone');
  assert.strictEqual(manager.isEnabled(), true);
  
  const patterns = manager.getPatterns();
  assert.ok(patterns.includes('src/**'));
  assert.ok(patterns.includes('*.md'));
});

test('ok:sparse-checkout-matches-root-files-cone', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src'], 'cone');
  
  // Root files should always be included in cone mode
  assert.strictEqual(manager.matches('README.md'), true);
  assert.strictEqual(manager.matches('package.json'), true);
  assert.strictEqual(manager.matches('LICENSE'), true);
});

test('ok:sparse-checkout-matches-included-directory-cone', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src'], 'cone');
  
  // Files in included directory should match
  assert.strictEqual(manager.matches('src/index.ts'), true);
  assert.strictEqual(manager.matches('src/utils/helper.ts'), true);
  assert.strictEqual(manager.matches('src/deep/nested/file.ts'), true);
});

test('ok:sparse-checkout-excludes-non-included-directory-cone', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src'], 'cone');
  
  // Files outside included directory should not match
  assert.strictEqual(manager.matches('tests/test.ts'), false);
  assert.strictEqual(manager.matches('docs/README.md'), false);
  assert.strictEqual(manager.matches('dist/bundle.js'), false);
});

test('ok:sparse-checkout-multiple-directories-cone', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src', 'tests'], 'cone');
  
  assert.strictEqual(manager.matches('src/index.ts'), true);
  assert.strictEqual(manager.matches('tests/test.ts'), true);
  assert.strictEqual(manager.matches('docs/README.md'), false);
});

test('ok:sparse-checkout-normalizes-patterns', () => {
  const manager = SparseCheckoutManager.fromPatterns(['/src/', '/tests/', 'docs'], 'cone');
  
  // Should normalize leading/trailing slashes
  assert.strictEqual(manager.matches('src/index.ts'), true);
  assert.strictEqual(manager.matches('tests/test.ts'), true);
  assert.strictEqual(manager.matches('docs/README.md'), true);
});

test('ok:sparse-checkout-normalizes-paths', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src'], 'cone');
  
  // Should normalize leading slashes in paths
  assert.strictEqual(manager.matches('/src/index.ts'), true);
  assert.strictEqual(manager.matches('src/index.ts'), true);
});

test('ok:sparse-checkout-parent-directories-included-cone', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src/utils'], 'cone');
  
  // Parent directories should be included
  const directories = manager.getDirectories();
  assert.ok(directories.includes('src'));
  assert.ok(directories.includes('src/utils'));
  
  // Files in parent should match
  assert.strictEqual(manager.matches('src/index.ts'), true);
  assert.strictEqual(manager.matches('src/utils/helper.ts'), true);
});

test('ok:sparse-checkout-empty-patterns-cone', () => {
  const manager = SparseCheckoutManager.fromPatterns([], 'cone');
  
  // With no patterns, only root files should match
  assert.strictEqual(manager.matches('README.md'), true);
  assert.strictEqual(manager.matches('src/index.ts'), false);
});

test('ok:sparse-checkout-no-cone-mode-pattern-matching', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src/**', '*.md'], 'no-cone');
  
  assert.strictEqual(manager.matches('src/index.ts'), true);
  assert.strictEqual(manager.matches('src/utils/helper.ts'), true);
  assert.strictEqual(manager.matches('README.md'), true);
  assert.strictEqual(manager.matches('docs/README.md'), true);
  assert.strictEqual(manager.matches('tests/test.ts'), false);
});

test('ok:sparse-checkout-wildcard-pattern-no-cone', () => {
  const manager = SparseCheckoutManager.fromPatterns(['*'], 'no-cone');
  
  // Wildcard should match everything
  assert.strictEqual(manager.matches('any/path/file.ts'), true);
  assert.strictEqual(manager.matches('README.md'), true);
});

test('ok:sparse-checkout-disabled-matches-all', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src'], 'cone');
  manager.setEnabled(false);
  
  // When disabled, all paths should match
  assert.strictEqual(manager.matches('src/index.ts'), true);
  assert.strictEqual(manager.matches('tests/test.ts'), true);
  assert.strictEqual(manager.matches('docs/README.md'), true);
});

test('ok:sparse-checkout-enable-disable', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src'], 'cone');
  
  assert.strictEqual(manager.isEnabled(), true);
  assert.strictEqual(manager.matches('tests/test.ts'), false);
  
  manager.setEnabled(false);
  assert.strictEqual(manager.isEnabled(), false);
  assert.strictEqual(manager.matches('tests/test.ts'), true);
  
  manager.setEnabled(true);
  assert.strictEqual(manager.isEnabled(), true);
  assert.strictEqual(manager.matches('tests/test.ts'), false);
});

test('ok:sparse-checkout-load-from-file-cone-mode', async () => {
  const fileContent = `# Sparse checkout patterns
src/
tests/
docs/`;
  
  const mockFile = new MockFileHandle('sparse-checkout');
  mockFile.setFile(new File([fileContent], 'sparse-checkout'));
  
  const manager = await SparseCheckoutManager.fromFile(mockFile);
  
  assert.strictEqual(manager.getMode(), 'cone');
  assert.strictEqual(manager.isEnabled(), true);
  assert.strictEqual(manager.matches('src/index.ts'), true);
  assert.strictEqual(manager.matches('tests/test.ts'), true);
  assert.strictEqual(manager.matches('docs/README.md'), true);
});

test('ok:sparse-checkout-load-from-file-with-mode-spec', async () => {
  const fileContent = `!/* 
src/
tests/`;
  
  const mockFile = new MockFileHandle('sparse-checkout');
  mockFile.setFile(new File([fileContent], 'sparse-checkout'));
  
  const manager = await SparseCheckoutManager.fromFile(mockFile);
  
  assert.strictEqual(manager.getMode(), 'cone');
  assert.strictEqual(manager.isEnabled(), true);
});

test('ok:sparse-checkout-load-from-file-no-cone-mode', async () => {
  const fileContent = `!
src/**
*.md`;
  
  const mockFile = new MockFileHandle('sparse-checkout');
  mockFile.setFile(new File([fileContent], 'sparse-checkout'));
  
  const manager = await SparseCheckoutManager.fromFile(mockFile);
  
  assert.strictEqual(manager.getMode(), 'no-cone');
  assert.strictEqual(manager.isEnabled(), true);
});

test('ok:sparse-checkout-load-from-file-ignores-comments', async () => {
  const fileContent = `# This is a comment
src/
# Another comment
tests/`;
  
  const mockFile = new MockFileHandle('sparse-checkout');
  mockFile.setFile(new File([fileContent], 'sparse-checkout'));
  
  const manager = await SparseCheckoutManager.fromFile(mockFile);
  
  const directories = manager.getDirectories();
  assert.ok(directories.includes('src'));
  assert.ok(directories.includes('tests'));
  assert.ok(!directories.includes('#'));
});

test('ok:sparse-checkout-load-from-file-ignores-empty-lines', async () => {
  const fileContent = `src/

tests/


docs/`;
  
  const mockFile = new MockFileHandle('sparse-checkout');
  mockFile.setFile(new File([fileContent], 'sparse-checkout'));
  
  const manager = await SparseCheckoutManager.fromFile(mockFile);
  
  const directories = manager.getDirectories();
  assert.strictEqual(directories.length, 3);
  assert.ok(directories.includes('src'));
  assert.ok(directories.includes('tests'));
  assert.ok(directories.includes('docs'));
});

test('ok:sparse-checkout-get-directories-readonly', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src', 'tests'], 'cone');
  const directories = manager.getDirectories();
  
  // Should be readonly
  assert.throws(() => {
    (directories as any).push('new');
  }, TypeError);
});

test('ok:sparse-checkout-get-patterns-readonly', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src/**', '*.md'], 'no-cone');
  const patterns = manager.getPatterns();
  
  // Should be readonly
  assert.throws(() => {
    (patterns as any).push('new');
  }, TypeError);
});

test('ok:sparse-checkout-deep-nested-paths-cone', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src'], 'cone');
  
  // Deep nested paths should match
  assert.strictEqual(manager.matches('src/a/b/c/d/e/f/g/h/file.ts'), true);
});

test('ok:sparse-checkout-partial-prefix-match-cone', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src/utils'], 'cone');
  
  // Should match files in the exact directory
  assert.strictEqual(manager.matches('src/utils/helper.ts'), true);
  // Should match files in subdirectories
  assert.strictEqual(manager.matches('src/utils/nested/file.ts'), true);
  // Should match parent directory files
  assert.strictEqual(manager.matches('src/index.ts'), true);
  // Should not match unrelated directories
  assert.strictEqual(manager.matches('src/other/file.ts'), false);
});

test('ok:sparse-checkout-set-patterns-updates-state', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src'], 'cone');
  
  assert.strictEqual(manager.matches('src/index.ts'), true);
  assert.strictEqual(manager.matches('tests/test.ts'), false);
  
  manager.setPatterns(['tests']);
  
  assert.strictEqual(manager.matches('src/index.ts'), false);
  assert.strictEqual(manager.matches('tests/test.ts'), true);
});

test('ok:sparse-checkout-empty-string-pattern-ignored', () => {
  const manager = SparseCheckoutManager.fromPatterns(['src', '', 'tests', '   '], 'cone');
  
  const directories = manager.getDirectories();
  assert.ok(directories.includes('src'));
  assert.ok(directories.includes('tests'));
  assert.ok(!directories.includes(''));
});

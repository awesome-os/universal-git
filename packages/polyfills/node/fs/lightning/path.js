/**
 * 
normalize() Implementation: Instead of reduce, it uses a standard for...of loop. This approach builds up the resolved array step-by-step. Some developers find this imperative style easier to read and debug than a complex reducer function. The logic is also slightly different in how it handles the leading slash, which can be a valid alternative strategy.
resolve() Implementation: This function is now a prime example of a declarative style using Array.prototype.reduce. It elegantly expresses the core logic: "start with an empty path, and for each new path, either replace the accumulator if it's absolute or join it otherwise."
dirname() Implementation: This version uses a chained ternary operator. It's more compact than an if/else if/else block and is a common pattern for handling a few distinct conditions in a single expression.
Slightly different join(): This version includes a small improvement to filter out empty parts (.filter(Boolean)) and has a more robust regex to avoid collapsing protocol slashes (e.g., https://).
 */
// Helper for path normalization. It processes path segments like '.' and '..'.
/**
 * Joins path segments together, ensuring a single separator.
 * @param {...string} parts - The path parts to join.
 * @returns {string}
 */
export const join = (...parts) => {
  // Filter out empty parts to prevent leading/trailing slashes where not intended.
  const path = parts.filter(Boolean).join('/');
  // Replace multiple slashes with a single one, but handle protocol slashes (like http://)
  return path.replace(/([^:])(\/\/+)/g, '$1/');
};

/**
 * Splits a path into its segments.
 * @param {string} path - The path string.
 * @returns {string[]}
 */
export const split = (path) => {
  if (path === '') return [];
  if (path === '/') return ['/'];
  return path.split('/');
};

/**
 * Normalizes a path, resolving '..' and '.' segments.
 * This version uses a simple loop for a more imperative approach.
 * @param {string} path - The path to normalize.
 * @returns {string}
 */
export const normalize = (path) => {
  if (!path) return '.';

  const isAbsolute = path.startsWith('/');
  const parts = split(path.replace(/^\//, '')); // Temporarily remove root for easier processing
  const resolved = [];

  for (const part of parts) {
    if (part === '' || part === '.') continue; // Skip empty parts and '.'
    if (part === '..') {
      resolved.pop(); // Go up one level
    } else {
      resolved.push(part);
    }
  }

  // Re-add the root if it was an absolute path
  const finalPath = resolved.join('/');
  if (isAbsolute) {
    return `/${finalPath}`;
  }
  // If the path resolves to nothing (e.g., 'a/..'), return '.'
  return finalPath || '.';
};

/**
 * Resolves a sequence of paths into an absolute path.
 * This version uses `reduce` for a more declarative implementation.
 * @param {...string} paths - The paths to resolve.
 * @returns {string}
 */
export const resolve = (...paths) => {
  // Use reduce to process paths sequentially.
  const resolvedPath = paths.reduce((accumulator, currentPath) => {
    if (!currentPath) return accumulator;
    // If the current path is absolute, it replaces the accumulator.
    return currentPath.startsWith('/') ? currentPath : join(accumulator, currentPath);
  }, '');

  return normalize(resolvedPath);
};

/**
 * Returns the directory name of a path using a ternary expression.
 * @param {string} path - The path string.
 * @returns {string}
 */
export const dirname = (path) => {
  const lastIndex = path.lastIndexOf('/');
  return lastIndex === -1 ? '.' :
         lastIndex === 0  ? '/' :
         path.slice(0, lastIndex);
};

/**
 * Returns the last portion of a path using a ternary expression.
 * @param {string} path - The path string.
 * @returns {string}
 */
export const basename = (path) => {
  return path === '/' ? '' : path.slice(path.lastIndexOf('/') + 1);
};
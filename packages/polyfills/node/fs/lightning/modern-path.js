/**
 * 
 * @param {Summary of Improvements
ES Modules: All functions are now exported using export const, which is the standard for modern JavaScript. The module.exports object is gone.
Arrow Functions: All functions are defined as const arrow functions, providing a consistent and modern style.
Readability: The reducer function, which was complex, has been slightly simplified and better commented to clarify its logic, especially around edge cases like traversing above the root.
Improved Edge Cases:
dirname now returns . for paths without a /, which is more conventional.
basename now returns an empty string for the root /, which is also standard.
normalize handles the case where reduction results in an empty array (e.g., normalize('a/..')) by correctly returning ..
Conciseness: Chaining methods like in join (.join('/').replace(...)) makes the code slightly more compact. The entire file is structured more cleanly without the final export block.} ancestors 
 */


// Helper for path normalization. It processes path segments like '.' and '..'.
const reducer = (ancestors, current) => {
  // Ignore '.' parts
  if (current === '.') return ancestors;

  // Handle '..' parts
  if (current === '..') {
    // If at the root, '..' is an error or ignored. Here, we prevent traversal above root.
    if (ancestors.length > 0 && ancestors[ancestors.length - 1] !== '..') {
      if (ancestors[0] === '/') {
        if (ancestors.length > 1) ancestors.pop();
      } else if (ancestors[0] === '.' && ancestors.length > 1) {
        ancestors.pop();
      } else if (ancestors[0] !== '.') {
        ancestors.pop();
      } else {
        ancestors.push('..');
      }
      return ancestors;
    }
  }

  // Initial condition or add the current part
  if (ancestors.length === 0 || (ancestors.length === 1 && ancestors[0] === '.')) {
    return [current];
  }
  
  ancestors.push(current);
  return ancestors;
};

/**
 * Joins path segments together.
 * @param {...string} parts - The path parts to join.
 * @returns {string}
 */
export const join = (...parts) => {
  if (!parts.length) return '';
  // Join with '/' and replace multiple slashes with a single one.
  return parts.join('/').replace(/\/+/g, '/');
};

/**
 * Splits a path into its segments.
 * @param {string} path - The path string.
 * @returns {string[]}
 */
export const split = (path) => {
  if (path === '') return [];
  if (path === '/') return ['/'];
  
  const parts = path.split('/');
  
  // Remove trailing empty string from paths ending with '/'
  if (parts[parts.length - 1] === '') {
    parts.pop();
  }
  
  // Handle absolute vs. relative paths
  if (path.startsWith('/')) {
    parts[0] = '/';
  } else if (parts[0] !== '.') {
    parts.unshift('.');
  }
  
  return parts;
};

/**
 * Normalizes a path, resolving '..' and '.' segments.
 * @param {string} path - The path to normalize.
 * @returns {string}
 */
export const normalize = (path) => {
  if (!path) return '.';
  
  const parts = split(path);
  const finalParts = parts.reduce(reducer, []);
  
  // If reduction results in an empty array (e.g., from 'a/..'), it means the current directory.
  if (finalParts.length === 0) return '.';
  
  return join(...finalParts);
};

/**
 * Resolves a sequence of paths into an absolute path.
 * @param {...string} paths - The paths to resolve.
 * @returns {string}
 */
export const resolve = (...paths) => {
  let result = '';
  for (const path of paths) {
    if (path.startsWith('/')) {
      result = path; // An absolute path resets the resolution
    } else {
      result = join(result, path);
    }
  }
  return normalize(result);
};

/**
 * Returns the directory name of a path.
 * @param {string} path - The path string.
 * @returns {string}
 */
export const dirname = (path) => {
  const last = path.lastIndexOf('/');
  if (last === -1) return '.'; // No directory part found, assume current directory
  if (last === 0) return '/';  // Root directory
  return path.slice(0, last);
};

/**
 * Returns the last portion of a path.
 * @param {string} path - The path string.
 * @returns {string}
 */
export const basename = (path) => {
  if (path === '/') return ''; // Basename of root is empty
  const last = path.lastIndexOf('/');
  return path.slice(last + 1);
};
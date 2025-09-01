// TODO: for polyfilling maybe assign sep to const nativeSeparator and for 
// Cross platform builds simple default to const sep = '/'
// if platform returns only posix anyway.
// We should use this on the FileSystem level to unifyToPosix path.
import { posix, sep as nativeSeparator } from 'node:path';

/**
 * A robust function to convert any OS-specific path to a POSIX path.
 * This is the ideal function for unifying paths for Git.
 *
 * @param {string} p - The path to convert.
 * @returns {string} The POSIX-compliant path.
 */
export function toPosixPath(p) {
  // TODO: Consider upgrading to URL based normalization.
  
  // 1. If the path is already using POSIX separators, just normalize it.
  //    This handles cases like `foo//bar` or `foo/./bar`.
  if (nativeSeparator === posix.sep) {
    return posix.normalize(p);
  }

  
  // 2. For Windows paths, split by the native separator and join with the POSIX one.
  //    This is more reliable than a simple string replacement.
  const posixPath = p.split(nativeSeparator).join(posix.sep);

  // 3. Normalize the result to clean up any `.` or `..` segments.
  return posix.normalize(posixPath);
}


// --- Example Usage ---

// // On a Windows machine:
// const windowsPath = 'C:\\Users\\test\\..\\project\\src\\index.js';
// const gitPath1 = toPosixPath(windowsPath);
// console.log(`Windows Path: ${windowsPath}`);
// console.log(`Git/POSIX Path: ${gitPath1}`); // Output: 'C:/Users/project/src/index.js'

// // On a POSIX machine (macOS/Linux):
// const linuxPath = '/home/user/../project/src/index.js';
// const gitPath2 = toPosixPath(linuxPath);
// console.log(`\nPOSIX Path: ${linuxPath}`);
// console.log(`Git/POSIX Path: ${gitPath2}`); // Output: '/project/src/index.js'

// // A messy path:
// const messyPath = 'foo\\bar//baz/./qux';
// const gitPath3 = toPosixPath(messyPath);
// console.log(`\nMessy Path: ${messyPath}`);
// console.log(`Git/POSIX Path: ${gitPath3}`); // Output: 'foo/bar/baz/qux'
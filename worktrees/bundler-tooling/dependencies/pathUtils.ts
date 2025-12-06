// pathUtils.ts
import { URL } from 'url'; // Global URL object

export const isRelative = pathLike => (pathLike[1] !== ":" && pathLike[2] !== ":") || pathLike.startsWith(".") || !pathLike.startsWith("/");

// --- HELPERS ---
function isAbsolute(p: string): boolean {
  if (p.startsWith('/')) return true;
  // This platform-agnostic check handles "C:\" and "C:/"
  if (p.length > 1 && p[1] === ':' && /^[a-zA-Z]$/.test(p[0])) return true;
  return false;
}

// --- CORE UTILITIES ---

/**
 * A universal, platform-agnostic polyfill for Node's `pathToFileURL`.
 * It now strictly requires an absolute path.
 */
export function pathToFileURL(filePath: string): URL {
  if (filePath.startsWith('file://')) return new URL(filePath);
  if (!isAbsolute(filePath)) {
    throw new TypeError(`Invalid argument: "path" must be an absolute path. Received "${filePath}"`);
  }
  let resolvedPathname: string;
  if (filePath.length > 1 && filePath[1] === ':') {
    resolvedPathname = `/${filePath.replace(/\\/g, '/')}`;
  } else {
    resolvedPathname = filePath;
  }
  return new URL(resolvedPathname, 'file://');
}

/**
 * Normalizes a file path to a cross-platform, POSIX-style path.
 * Requires an absolute path.
 */
export function normalizePath(filePath: string): string {
  const url = pathToFileURL(filePath);
  let { pathname } = url;
  if (pathname.length > 2 && pathname.startsWith('/') && pathname[2] === ':') {
    return pathname.substring(1);
  }
  return pathname;
}


/**
 * A universal, platform-agnostic equivalent of Node's `path.dirname`.
 *
 * @param p The path to get the directory of.
 * @returns The directory path.
 */
export function dirname(p: string): string {
  // Normalize to forward slashes to simplify logic
  const normalizedPath = p.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  // If the path ends with a slash (is a directory), the last part will be empty.
  // Otherwise, the last part is the filename. In either case, pop() does the right thing.
  parts.pop();
  
  const dir = parts.join('/');
  
  // Handle root paths: `dirname('/a')` is `'/'`, `dirname('C:/a')` is `'C:/'`
  if (dir === '' && isAbsolute(p)) {
      return p.startsWith('/') ? '/' : p.substring(0, p.indexOf('/') + 1);
  }

  return dir || '.';
}

/**
 * A universal, URL-based equivalent of Node's `path.relative`.
 * It now strictly requires BOTH paths to be absolute.
 *
 * @param from The absolute base path.
 * @param to The absolute target path.
 * @returns A relative path string using POSIX separators.
 * @throws {TypeError} If either `from` or `to` are not absolute paths.
 */
export function relative(from: string, to: string): string {
  // Step 1: Enforce the contract. Both paths must be absolute.
  if (!isAbsolute(from) || !isAbsolute(to)) {
    throw new TypeError(
      `Invalid arguments: Both "from" and "to" paths must be absolute. Received from: "${from}", to: "${to}"`
    );
  }

  // Step 2: Canonicalize into URL objects.
  const fromUrl = pathToFileURL(from);
  const toUrl = pathToFileURL(to);

  if (fromUrl.href === toUrl.href) return '';

  // Step 3: Split pathnames into segments for comparison.
  const fromSegments = fromUrl.pathname.split('/');
  const toSegments = toUrl.pathname.split('/');
  
  // Find the last common segment.
  let i = 0;
  while (i < fromSegments.length && i < toSegments.length && fromSegments[i] === toSegments[i]) {
    i++;
  }

  // Step 4: Calculate "up" and "down" parts.
  const upLevels = fromSegments.length - i - 1;
  const upPathParts = Array(upLevels > 0 ? upLevels : 0).fill('..');
  const downPathParts = toSegments.slice(i);
  
  const result = [...upPathParts, ...downPathParts].join('/');

  return result === '' ? '.' : result;
}
// Same as join
export function simpleJoin(...parts: string[]): string {
    if (parts.length === 0) return '.';
    const joined = parts.filter(Boolean).join('/');
    if (!joined) return '.';
    const url = new URL(joined, 'file://dummybase');
    let normalized = url.pathname;
    if (normalized.startsWith('/')) normalized = normalized.substring(1);
    return normalized || '.';
}

/**
 * A universal, URL-based equivalent of Node's `path.resolve`.
 * Resolves a sequence of paths or path segments into an absolute path.
 * If multiple absolute paths are provided, the rightmost one is used as the base,
 * and all paths to its left are ignored.
 *
 * @param {...string} paths A sequence of paths or path segments.
 * @returns {string} The resolved absolute path, normalized with POSIX separators.
 * @throws {TypeError} If no absolute path segment is provided in the arguments.
 */
export function resolve(...paths: string[]): string {
  if (paths.length === 0) {
    throw new TypeError("At least one path segment is required.");
  }

  // Find the rightmost absolute path to use as the base.
  // This is the key to mimicking Node's `path.resolve` behavior.
  let i = paths.length - 1;
  while (i >= 0 && !isAbsolute(paths[i])) {
    i--; // Move left until we find an absolute path.
  }

  // If i < 0, it means no absolute path was found in the arguments.
  if (i < 0) {
    throw new TypeError(`Unable to resolve paths: no absolute path segment found in [${paths.join(', ')}]`);
  }

  // `absoluteBase` becomes the rightmost absolute path. Any paths to its left are ignored.
  const absoluteBase = paths[i];

  // `relativeSegments` are ONLY the paths to the right of our new base.
  const relativeSegments = paths.slice(i + 1);

  // --- Resolution Logic ---
  // 1. Convert the absolute base path into a canonical base URL.
  const baseUrl = pathToFileURL(absoluteBase);
  // 2. Join the remaining relative segments into a single relative path.
  const relativePath = simpleJoin(...relativeSegments);
  // 3. The `URL` constructor resolves the relative path against the base URL.
  const resolvedUrl = new URL(relativePath, baseUrl);
  // 4. Convert the resulting URL's pathname back into our normalized file path format.
  let { pathname } = resolvedUrl;
  if (pathname.length > 2 && pathname.startsWith('/') && pathname[2] === ':') {
    pathname = pathname.substring(1);
  }

  return pathname;
}
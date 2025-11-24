import { pkg } from "./pkg.ts"

/**
 * Return the version number of universal-git
 *
 * I don't know why you might need this. I added it just so I could check that I was getting
 * the correct version of the library and not a cached version.
 *
 * @returns {string} the version string taken from package.json at publication time
 *
 * @example
 * console.log(git.version())
 *
 */
export function version(): string {
  try {
    return pkg.version
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.version'
    throw err
  }
}



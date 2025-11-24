/**
 * Detect Git forge type from a URL
 * 
 * This function analyzes a repository URL to determine which Git forge
 * it belongs to (GitHub, GitLab, Bitbucket, etc.).
 */

/**
 * Known Git forge types
 */
export type ForgeType = 'github' | 'gitlab' | 'bitbucket' | 'azure' | 'unknown'

/**
 * Detect the Git forge type from a URL
 * 
 * @param url - The repository URL
 * @returns The forge type, or 'unknown' if it cannot be determined
 */
export function detectForge(url: string): ForgeType {
  const urlLower = url.toLowerCase()

  // GitHub detection
  if (urlLower.includes('github.com') || urlLower.includes('github.io')) {
    return 'github'
  }

  // GitLab detection
  if (urlLower.includes('gitlab.com') || urlLower.includes('gitlab.io')) {
    return 'gitlab'
  }

  // Bitbucket detection
  if (urlLower.includes('bitbucket.org') || urlLower.includes('bitbucket.io')) {
    return 'bitbucket'
  }

  // Azure DevOps detection
  if (
    urlLower.includes('dev.azure.com') ||
    urlLower.includes('visualstudio.com') ||
    urlLower.includes('azure.com')
  ) {
    return 'azure'
  }

  // Try to detect from URL patterns
  // GitHub Enterprise or self-hosted instances might use different domains
  // GitLab self-hosted instances might use different domains
  // These would need to be configured explicitly

  return 'unknown'
}

/**
 * Extract owner and repository name from a URL
 * 
 * @param url - The repository URL
 * @returns Object with owner and repo, or null if URL cannot be parsed
 */
export function parseRepositoryUrl(url: string): { owner: string; repo: string } | null {
  try {
    // Remove .git suffix if present
    const cleanUrl = url.replace(/\.git$/, '')

    // Try to parse as a standard Git URL
    // Format: https://forge.com/owner/repo
    const match = cleanUrl.match(/https?:\/\/(?:[^@]+@)?([^/]+)\/([^/]+)\/([^/]+)/)
    if (match) {
      const [, , owner, repo] = match
      return { owner, repo }
    }

    // Try SSH format: git@forge.com:owner/repo
    const sshMatch = cleanUrl.match(/git@([^:]+):([^/]+)\/([^/]+)/)
    if (sshMatch) {
      const [, , owner, repo] = sshMatch
      return { owner, repo }
    }

    return null
  } catch {
    return null
  }
}


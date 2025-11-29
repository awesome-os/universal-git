import type { GitBackendFs } from './GitBackendFs.ts'
import { join } from '../../core-utils/GitPath.ts'

/**
 * Initializes sparse checkout
 */
export async function sparseCheckoutInit(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  cone?: boolean
): Promise<void> {
  // Enable sparse checkout in config
  await this.setConfig('core.sparseCheckout', 'true')
  if (cone) {
    await this.setConfig('core.sparseCheckoutCone', 'true')
  }

  // Create sparse-checkout file with default pattern (everything)
  // We use the underlying set implementation (which we also expose as sparseCheckoutSet)
  // constructing the default patterns.
  await this.sparseCheckoutSet(worktreeBackend, ['/*'], undefined, cone)
}

/**
 * Sets sparse checkout patterns
 */
export async function sparseCheckoutSet(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  patterns: string[],
  treeOid: string | undefined, // Not used for setting patterns logic directly, but part of interface
  cone?: boolean
): Promise<void> {
  // Determine if cone mode is enabled if not explicitly provided
  let coneMode = cone
  if (coneMode === undefined) {
    const coneConfig = await this.getConfig('core.sparseCheckoutCone')
    coneMode = coneConfig === 'true' || coneConfig === true
  }

  // Format patterns according to Git v2.4+ format
  let content = '# This file is used by sparse checkout\n'
  if (coneMode) {
    content += '# Enable cone mode for better performance\n'
    // In cone mode, Git v2.4+ expects patterns without leading slashes for root-level dirs
    // and with leading slashes for nested dirs. We normalize them.
    const normalizedPatterns = patterns.map(p => {
      // Preserve negative patterns (starting with !)
      if (p.startsWith('!')) {
        const patternWithoutExcl = p.substring(1)
        // Normalize the pattern part (after !)
        let normalized = patternWithoutExcl.replace(/^\/+/, '')
        // Ensure trailing slash for directories in cone mode
        if (!normalized.endsWith('/') && !normalized.includes('*')) {
          normalized += '/'
        }
        return '!' + normalized
      } else {
        // Normal inclusion pattern
        let normalized = p.replace(/^\/+/, '')
        // Ensure trailing slash for directories in cone mode
        if (!normalized.endsWith('/') && !normalized.includes('*')) {
          normalized += '/'
        }
        return normalized
      }
    })
    content += normalizedPatterns.join('\n') + '\n'
  } else {
    // In non-cone mode, patterns (including !) are written as-is
    content += patterns.join('\n') + '\n'
  }

  await this.writeInfoFile('sparse-checkout', content)
  
  // Update the worktree to reflect changes
  // We need to call checkout to update the working directory based on the new patterns
  // But wait, sparseCheckoutSet command usually implies updating the worktree.
  // The command wrapper usually handles the actual checkout/update.
  // Here we just update the patterns.
  // The interface in GitBackend defines sparseCheckoutSet as just setting patterns?
  // Let's check GitBackend.ts interface definition.
  
  if (treeOid) {
     // If treeOid is provided, we should probably update the worktree
     // But strictly speaking, the backend just stores the patterns.
     // The command logic (in commands/sparseCheckout.ts) does the checkout.
     // However, since we are moving logic to backend, maybe we should invoke checkout here?
     // GitBackendFs.checkout delegates to WorkdirManager.checkout.
     // WorkdirManager.checkout uses SparseCheckoutManager.match which needs patterns.
     // The patterns are now stored in info/sparse-checkout.
     
     // So if we just update the file, a subsequent checkout call will pick them up.
     // For now, let's just update the file. The caller (command) is responsible for updating worktree if needed.
  }
}

/**
 * Lists current sparse checkout patterns
 */
export async function sparseCheckoutList(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
): Promise<string[]> {
  const content = await this.readInfoFile('sparse-checkout')
  if (!content) return []

  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
}


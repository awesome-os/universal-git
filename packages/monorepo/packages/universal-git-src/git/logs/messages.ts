/**
 * Standard reflog messages matching Git's native behavior
 * 
 * These constants provide consistent reflog message formatting across all commands.
 * They match Git's native reflog message patterns to ensure compatibility.
 */
export const REFLOG_MESSAGES = {
  /**
   * Commit reflog message
   * @param message - The commit message (typically first line)
   * @returns Reflog message: "commit: <message>"
   */
  COMMIT: (message: string): string => {
    return `commit: ${message}`
  },

  /**
   * Commit amend reflog message
   * @param message - The commit message (typically first line)
   * @returns Reflog message: "commit (amend): <message>"
   */
  COMMIT_AMEND: (message: string): string => {
    return `commit (amend): ${message}`
  },

  /**
   * Branch creation reflog message
   * @param branchName - The branch name or ref that the branch was created from
   * @returns Reflog message: "branch: Created from <branchName>"
   */
  BRANCH_CREATE: (branchName: string): string => {
    return `branch: Created from ${branchName}`
  },

  /**
   * Tag creation reflog message
   * @param tagName - The name of the tag being created
   * @returns Reflog message: "tag: tagging <tagName>"
   */
  TAG_CREATE: (tagName: string): string => {
    return `tag: tagging ${tagName}`
  },

  /**
   * Tag deletion reflog message
   * @param tagName - The name of the tag being deleted
   * @returns Reflog message: "tag: deleting <tagName>"
   */
  TAG_DELETE: (tagName: string): string => {
    return `tag: deleting ${tagName}`
  },

  /**
   * Reset reflog message (soft reset)
   * @param ref - The ref being updated
   * @returns Reflog message: "reset: updating <ref>"
   */
  RESET_SOFT: (ref: string): string => {
    return `reset: updating ${ref}`
  },

  /**
   * Reset reflog message (mixed reset)
   * @param ref - The ref or commit being reset to
   * @returns Reflog message: "reset: moving to <ref>"
   */
  RESET_MIXED: (ref: string): string => {
    return `reset: moving to ${ref}`
  },

  /**
   * Reset reflog message (hard reset)
   * @param ref - The ref or commit being reset to
   * @returns Reflog message: "reset: moving to <ref>"
   */
  RESET_HARD: (ref: string): string => {
    return `reset: moving to ${ref}`
  },

  /**
   * Rebase start reflog message
   * @param upstream - The upstream branch being rebased onto
   * @returns Reflog message: "rebase: rebasing onto <upstream>"
   */
  REBASE_START: (upstream: string): string => {
    return `rebase: rebasing onto ${upstream}`
  },

  /**
   * Rebase finish reflog message
   * @param branch - The branch being returned to
   * @returns Reflog message: "rebase finished: returning to <branch>"
   */
  REBASE_FINISH: (branch: string): string => {
    return `rebase finished: returning to ${branch}`
  },

  /**
   * Fast-forward merge reflog message
   * @param branch - The branch being merged
   * @returns Reflog message: "merge <branch>: Fast-forward"
   */
  MERGE_FF: (branch: string): string => {
    return `merge ${branch}: Fast-forward`
  },

  /**
   * Push update reflog message
   * @returns Reflog message: "update by push"
   */
  PUSH_UPDATE: (): string => {
    return 'update by push'
  },

  /**
   * Push delete reflog message
   * @returns Reflog message: "update by push"
   */
  PUSH_DELETE: (): string => {
    return 'update by push'
  },
}


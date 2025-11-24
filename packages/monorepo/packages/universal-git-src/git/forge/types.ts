/**
 * Type definitions for Git Forge API operations
 * 
 * These types are used across all forge adapters to ensure consistency
 * while allowing forge-specific implementations.
 */

/**
 * Base repository information
 */
export interface Repository {
  id: string | number
  name: string
  fullName: string // e.g., "owner/repo"
  owner: string
  description?: string
  private: boolean
  url: string
  cloneUrl: string
  defaultBranch: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Options for creating a repository
 */
export interface CreateRepoOptions {
  name: string
  description?: string
  private?: boolean
  defaultBranch?: string
  autoInit?: boolean
  license?: string
  gitignoreTemplate?: string
}

/**
 * Pull Request / Merge Request information
 */
export interface PullRequest {
  id: string | number
  number: number
  title: string
  body?: string
  state: 'open' | 'closed' | 'merged'
  head: {
    ref: string
    sha: string
    repo: Repository
  }
  base: {
    ref: string
    sha: string
    repo: Repository
  }
  author: {
    login: string
    name?: string
    email?: string
    avatarUrl?: string
  }
  createdAt: Date
  updatedAt: Date
  mergedAt?: Date
  closedAt?: Date
  url: string
  htmlUrl: string
}

/**
 * Options for creating a pull request
 */
export interface CreatePROptions {
  title: string
  body?: string
  head: string // Branch name
  base: string // Branch name
  draft?: boolean
  maintainerCanModify?: boolean
}

/**
 * Options for listing pull requests
 */
export interface ListPROptions {
  state?: 'open' | 'closed' | 'all'
  head?: string
  base?: string
  sort?: 'created' | 'updated' | 'popularity'
  direction?: 'asc' | 'desc'
  perPage?: number
  page?: number
}

/**
 * Options for updating a pull request
 */
export interface UpdatePROptions {
  title?: string
  body?: string
  state?: 'open' | 'closed'
  base?: string
}

/**
 * Options for merging a pull request
 */
export interface MergePROptions {
  commitTitle?: string
  commitMessage?: string
  mergeMethod?: 'merge' | 'squash' | 'rebase'
}

/**
 * Result of merging a pull request
 */
export interface MergeResult {
  merged: boolean
  sha?: string
  message?: string
}

/**
 * Issue information
 */
export interface Issue {
  id: string | number
  number: number
  title: string
  body?: string
  state: 'open' | 'closed'
  author: {
    login: string
    name?: string
    email?: string
    avatarUrl?: string
  }
  assignees: Array<{
    login: string
    name?: string
    email?: string
    avatarUrl?: string
  }>
  labels: Array<{
    name: string
    color?: string
  }>
  milestone?: {
    id: string | number
    title: string
    state: 'open' | 'closed'
  }
  createdAt: Date
  updatedAt: Date
  closedAt?: Date
  url: string
  htmlUrl: string
}

/**
 * Options for creating an issue
 */
export interface CreateIssueOptions {
  title: string
  body?: string
  assignees?: string[]
  labels?: string[]
  milestone?: string | number
}

/**
 * Options for listing issues
 */
export interface ListIssuesOptions {
  state?: 'open' | 'closed' | 'all'
  assignee?: string
  labels?: string[]
  sort?: 'created' | 'updated' | 'comments'
  direction?: 'asc' | 'desc'
  perPage?: number
  page?: number
}

/**
 * Options for updating an issue
 */
export interface UpdateIssueOptions {
  title?: string
  body?: string
  state?: 'open' | 'closed'
  assignees?: string[]
  labels?: string[]
  milestone?: string | number | null
}

/**
 * Release information
 */
export interface Release {
  id: string | number
  tagName: string
  name?: string
  body?: string
  draft: boolean
  prerelease: boolean
  author: {
    login: string
    name?: string
    email?: string
    avatarUrl?: string
  }
  createdAt: Date
  publishedAt?: Date
  url: string
  htmlUrl: string
  assets: Array<{
    id: string | number
    name: string
    url: string
    size: number
    contentType: string
    downloadCount?: number
  }>
}

/**
 * Options for creating a release
 */
export interface CreateReleaseOptions {
  tagName: string
  name?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
  targetCommitish?: string
}

/**
 * Options for updating a release
 */
export interface UpdateReleaseOptions {
  name?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
}

/**
 * Branch protection rules
 */
export interface BranchProtectionRules {
  requiredStatusChecks?: {
    strict: boolean
    contexts: string[]
  }
  enforceAdmins?: boolean
  requiredPullRequestReviews?: {
    requiredApprovingReviewCount?: number
    dismissStaleReviews?: boolean
    requireCodeOwnerReviews?: boolean
  }
  restrictions?: {
    users: string[]
    teams: string[]
    apps?: string[]
  }
  requiredLinearHistory?: boolean
  allowForcePushes?: boolean
  allowDeletions?: boolean
}

/**
 * Branch protection information
 */
export interface BranchProtection {
  enabled: boolean
  rules?: BranchProtectionRules
}

/**
 * Webhook information
 */
export interface Webhook {
  id: string | number
  url: string
  events: string[]
  active: boolean
  contentType?: string
  secret?: string
  insecureSsl?: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Options for creating a webhook
 */
export interface CreateWebhookOptions {
  url: string
  events: string[]
  active?: boolean
  contentType?: string
  secret?: string
  insecureSsl?: boolean
}

/**
 * Forge authentication information
 */
export interface ForgeAuth {
  token?: string
  username?: string
  password?: string
  type?: 'token' | 'basic' | 'oauth'
}


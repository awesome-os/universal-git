/**
 * Git Forge API Infrastructure
 * 
 * This module provides the base infrastructure for supporting multiple
 * Git forge implementations (GitHub, GitLab, Bitbucket, etc.) via their
 * HTTP REST APIs.
 * 
 * @module git/forge
 */

export { GitForgeAdapter } from './GitForgeAdapter.ts'
export { ForgeRegistry } from './ForgeRegistry.ts'
export { detectForge, parseRepositoryUrl, type ForgeType } from './detectForge.ts'

export type {
  Repository,
  CreateRepoOptions,
  PullRequest,
  CreatePROptions,
  ListPROptions,
  UpdatePROptions,
  MergePROptions,
  MergeResult,
  Issue,
  CreateIssueOptions,
  ListIssuesOptions,
  UpdateIssueOptions,
  Release,
  CreateReleaseOptions,
  UpdateReleaseOptions,
  BranchProtection,
  BranchProtectionRules,
  Webhook,
  CreateWebhookOptions,
  ForgeAuth,
} from './types.ts'


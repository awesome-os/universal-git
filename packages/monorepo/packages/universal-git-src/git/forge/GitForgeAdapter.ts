/**
 * Base interface for Git Forge adapters
 * 
 * This interface defines the contract that all forge adapters must implement.
 * Each forge (GitHub, GitLab, Bitbucket, etc.) will have its own implementation
 * that adapts the forge's specific API to this common interface.
 */

import type { HttpClient } from '../../git/remote/types.ts'
import type {
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

/**
 * Base abstract class for Git Forge adapters
 * 
 * All forge adapters must extend this class and implement all abstract methods.
 */
export abstract class GitForgeAdapter {
  /**
   * The name of the forge (e.g., 'github', 'gitlab', 'bitbucket')
   */
  abstract readonly name: string

  /**
   * The base API URL for this forge (e.g., 'https://api.github.com')
   */
  protected abstract readonly apiBaseUrl: string

  /**
   * The HTTP client to use for API requests
   */
  protected http: HttpClient

  /**
   * Authentication information
   */
  protected auth?: ForgeAuth

  constructor(http: HttpClient, auth?: ForgeAuth) {
    this.http = http
    this.auth = auth
  }

  /**
   * Detect if this adapter can handle the given URL
   * 
   * @param url - The repository URL to check
   * @returns true if this adapter can handle the URL, false otherwise
   */
  abstract detect(url: string): boolean

  /**
   * Parse a repository URL to extract owner and repo name
   * 
   * @param url - The repository URL
   * @returns Object with owner and repo, or null if URL cannot be parsed
   */
  abstract parseRepositoryUrl(url: string): { owner: string; repo: string } | null

  // ============================================================================
  // Repository Operations
  // ============================================================================

  /**
   * Create a new repository
   */
  abstract createRepository(options: CreateRepoOptions): Promise<Repository>

  /**
   * Get repository information
   */
  abstract getRepository(owner: string, repo: string): Promise<Repository>

  /**
   * List repositories for a user or organization
   */
  abstract listRepositories(owner: string): Promise<Repository[]>

  /**
   * Delete a repository
   */
  abstract deleteRepository(owner: string, repo: string): Promise<void>

  // ============================================================================
  // Pull Request / Merge Request Operations
  // ============================================================================

  /**
   * Create a pull request (or merge request in GitLab)
   */
  abstract createPullRequest(
    owner: string,
    repo: string,
    options: CreatePROptions
  ): Promise<PullRequest>

  /**
   * Get a pull request by number
   */
  abstract getPullRequest(
    owner: string,
    repo: string,
    number: number
  ): Promise<PullRequest>

  /**
   * List pull requests
   */
  abstract listPullRequests(
    owner: string,
    repo: string,
    options?: ListPROptions
  ): Promise<PullRequest[]>

  /**
   * Update a pull request
   */
  abstract updatePullRequest(
    owner: string,
    repo: string,
    number: number,
    updates: UpdatePROptions
  ): Promise<PullRequest>

  /**
   * Merge a pull request
   */
  abstract mergePullRequest(
    owner: string,
    repo: string,
    number: number,
    options?: MergePROptions
  ): Promise<MergeResult>

  /**
   * Close a pull request
   */
  abstract closePullRequest(
    owner: string,
    repo: string,
    number: number
  ): Promise<void>

  // ============================================================================
  // Issue Operations
  // ============================================================================

  /**
   * Create an issue
   */
  abstract createIssue(
    owner: string,
    repo: string,
    issue: CreateIssueOptions
  ): Promise<Issue>

  /**
   * Get an issue by number
   */
  abstract getIssue(
    owner: string,
    repo: string,
    number: number
  ): Promise<Issue>

  /**
   * List issues
   */
  abstract listIssues(
    owner: string,
    repo: string,
    options?: ListIssuesOptions
  ): Promise<Issue[]>

  /**
   * Update an issue
   */
  abstract updateIssue(
    owner: string,
    repo: string,
    number: number,
    updates: UpdateIssueOptions
  ): Promise<Issue>

  /**
   * Close an issue
   */
  abstract closeIssue(
    owner: string,
    repo: string,
    number: number
  ): Promise<void>

  // ============================================================================
  // Release Operations
  // ============================================================================

  /**
   * Create a release
   */
  abstract createRelease(
    owner: string,
    repo: string,
    release: CreateReleaseOptions
  ): Promise<Release>

  /**
   * Get a release by tag name
   */
  abstract getRelease(
    owner: string,
    repo: string,
    tag: string
  ): Promise<Release>

  /**
   * List releases
   */
  abstract listReleases(
    owner: string,
    repo: string
  ): Promise<Release[]>

  /**
   * Update a release
   */
  abstract updateRelease(
    owner: string,
    repo: string,
    tag: string,
    updates: UpdateReleaseOptions
  ): Promise<Release>

  /**
   * Delete a release
   */
  abstract deleteRelease(
    owner: string,
    repo: string,
    tag: string
  ): Promise<void>

  // ============================================================================
  // Branch Protection Operations
  // ============================================================================

  /**
   * Get branch protection rules
   */
  abstract getBranchProtection(
    owner: string,
    repo: string,
    branch: string
  ): Promise<BranchProtection>

  /**
   * Set branch protection rules
   */
  abstract setBranchProtection(
    owner: string,
    repo: string,
    branch: string,
    rules: BranchProtectionRules
  ): Promise<BranchProtection>

  /**
   * Delete branch protection rules
   */
  abstract deleteBranchProtection(
    owner: string,
    repo: string,
    branch: string
  ): Promise<void>

  // ============================================================================
  // Webhook Operations
  // ============================================================================

  /**
   * Create a webhook
   */
  abstract createWebhook(
    owner: string,
    repo: string,
    webhook: CreateWebhookOptions
  ): Promise<Webhook>

  /**
   * List webhooks
   */
  abstract listWebhooks(
    owner: string,
    repo: string
  ): Promise<Webhook[]>

  /**
   * Delete a webhook
   */
  abstract deleteWebhook(
    owner: string,
    repo: string,
    id: string
  ): Promise<void>

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Make an authenticated HTTP request to the forge API
   * 
   * This is a helper method that subclasses can use to make API requests
   * with proper authentication headers.
   */
  protected async apiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ): Promise<T> {
    const url = `${this.apiBaseUrl}${path}`
    
    // Add authentication headers
    const authHeaders: Record<string, string> = { ...headers }
    if (this.auth?.token) {
      authHeaders.Authorization = `Bearer ${this.auth.token}`
    } else if (this.auth?.username && this.auth?.password) {
      const credentials = btoa(`${this.auth.username}:${this.auth.password}`)
      authHeaders.Authorization = `Basic ${credentials}`
    }

    // Add content type for POST/PUT/PATCH requests
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      authHeaders['Content-Type'] = 'application/json'
    }

    // Convert body to AsyncIterableIterator if present
    let requestBody: AsyncIterableIterator<Uint8Array> | undefined
    if (body) {
      const jsonBody = JSON.stringify(body)
      requestBody = fromValue(new TextEncoder().encode(jsonBody))
    }

    const response = await this.http.request({
      method,
      url,
      headers: authHeaders,
      body: requestBody,
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const errorBody = response.body ? await collect(response.body) : new Uint8Array(0)
      const errorText = new TextDecoder().decode(errorBody)
      throw new Error(
        `Forge API error (${response.statusCode}): ${errorText}`
      )
    }

    const responseBody = response.body ? await collect(response.body) : new Uint8Array(0)
    const responseText = new TextDecoder().decode(responseBody)
    return JSON.parse(responseText) as T
  }
}

// Helper imports for apiRequest
import { fromValue } from '../../utils/fromValue.ts'
import { collect } from '../../utils/collect.ts'


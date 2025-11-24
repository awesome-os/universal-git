import { RevisionParser } from './RevisionParser.ts'
import { Repository } from "../core-utils/Repository.ts"
import { assertDefined } from "../utils/typeHelpers.ts"

/**
 * Routes commands to their handlers
 */
export class CommandRouter {
  private _revisionParser: RevisionParser | null = null
  private readonly repo: Repository

  constructor(repo: Repository) {
    this.repo = repo
  }

  /**
   * Gets the revision parser (lazy-loaded)
   * @private
   */
  private async _getRevisionParser(): Promise<RevisionParser> {
    if (!this._revisionParser) {
      const gitdir = await this.repo.getGitdir()
      this._revisionParser = new RevisionParser(this.repo.fs, gitdir, this.repo.cache)
    }
    return this._revisionParser
  }

  /**
   * Dispatches a command to its handler
   */
  async dispatch(
    command: string,
    flags: Record<string, unknown>,
    positional: string[]
  ): Promise<unknown> {
    const handler = this._getHandler(command)
    if (!handler) {
      throw new Error(`Unknown command: ${command}`)
    }

    return handler.call(this, flags, positional)
  }

  /**
   * Gets the handler for a command
   * @private
   */
  private _getHandler(
    command: string
  ): ((flags: Record<string, unknown>, positional: string[]) => Promise<unknown>) | undefined {
    const handlers: Record<string, (flags: Record<string, unknown>, positional: string[]) => Promise<unknown>> = {
      init: this._handleInit,
      add: this._handleAdd,
      commit: this._handleCommit,
      status: this._handleStatus,
      log: this._handleLog,
      checkout: this._handleCheckout,
      branch: this._handleBranch,
      merge: this._handleMerge,
      pull: this._handlePull,
      push: this._handlePush,
      fetch: this._handleFetch,
      clone: this._handleClone,
      tag: this._handleTag,
      diff: this._handleDiff,
      show: this._handleShow,
      rm: this._handleRm,
      remote: this._handleRemote,
      sparseCheckout: this._handleSparseCheckout,
      ungit: this._handleUngit,
    }

    return handlers[command]
  }

  /**
   * Handler for init command
   * @private
   */
  private async _handleInit(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { init } = await import('../commands/init.ts')
    const cwd = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.'
    return init({
      fs: this.repo.fs,
      dir: positional[0] || cwd,
      bare: (flags.bare as boolean) || false,
      defaultBranch: (flags.defaultBranch as string) || 'master',
    })
  }

  /**
   * Handler for add command
   * @private
   */
  private async _handleAdd(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { add } = await import('../commands/add.ts')
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    const dir = this.repo.dir
    if (!dir) {
      throw new Error('dir is required for add command')
    }
    return add({
      fs: this.repo.fs,
      dir,
      gitdir,
      filepath: positional.length > 0 ? positional : '.',
      force: (flags.force as boolean) || false,
      cache: this.repo.cache,
    })
  }

  /**
   * Handler for commit command
   * @private
   */
  private async _handleCommit(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { commit } = await import('../commands/commit.ts')
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    return commit({
      fs: this.repo.fs,
      dir: this.repo.dir ?? undefined,
      gitdir,
      message: (flags.message as string) || (flags.m as string) || positional.join(' '),
      author: flags.author as { name: string; email: string } | undefined,
      committer: flags.committer as { name: string; email: string } | undefined,
      cache: this.repo.cache,
    })
  }

  /**
   * Handler for status command
   * @private
   */
  private async _handleStatus(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { status } = await import('../commands/status.ts')
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    if (positional.length > 0) {
      // Status for specific file
      const dir = this.repo.dir
      if (!dir) {
        throw new Error('dir is required for status command with filepath')
      }
      return status({
        fs: this.repo.fs,
        dir,
        gitdir,
        filepath: positional[0],
        cache: this.repo.cache,
      })
    } else {
      // Full status (would need statusMatrix or similar)
      throw new Error('Full status not yet implemented in CLI')
    }
  }

  /**
   * Handler for log command
   * @private
   */
  private async _handleLog(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { log } = await import('../commands/log.ts')
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    const ref = positional[0] || 'HEAD'
    return log({
      fs: this.repo.fs,
      dir: this.repo.dir ?? undefined,
      gitdir,
      ref,
      depth: (flags.depth as number) || (flags.n as number),
      filepath: flags.filepath as string | undefined,
      cache: this.repo.cache,
    })
  }

  /**
   * Handler for checkout command
   * @private
   */
  private async _handleCheckout(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { checkout } = await import('../commands/checkout.ts')
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    return checkout({
      fs: this.repo.fs,
      dir: this.repo.dir ?? undefined,
      gitdir,
      ref: positional[0],
      filepaths: positional.slice(1),
      force: (flags.force as boolean) || (flags.f as boolean) || false,
      cache: this.repo.cache,
    })
  }

  /**
   * Handler for branch command
   * @private
   */
  private async _handleBranch(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    if (flags.delete || flags.d) {
      const { deleteBranch } = await import('../commands/deleteBranch.ts')
      return deleteBranch({
        fs: this.repo.fs,
        dir: this.repo.dir ?? undefined,
        gitdir,
        ref: positional[0],
      })
    }
    const { branch } = await import('../commands/branch.ts')
    return branch({
      fs: this.repo.fs,
      dir: this.repo.dir ?? undefined,
      gitdir,
      ref: positional[0],
      object: flags.object as string | undefined,
      checkout: flags.checkout as boolean | undefined,
      force: (flags.force as boolean) || (flags.f as boolean) || false,
    })
  }

  /**
   * Handler for merge command
   * @private
   */
  private async _handleMerge(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { merge } = await import('../commands/merge.ts')
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    return merge({
      fs: this.repo.fs,
      dir: this.repo.dir ?? undefined,
      gitdir,
      theirs: positional[0],
      message: (flags.message as string) || (flags.m as string),
      fastForward: !((flags['no-ff'] as boolean) || (flags.noFf as boolean)),
      cache: this.repo.cache,
    })
  }

  /**
   * Handler for pull command
   * @private
   */
  private async _handlePull(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    // Pull requires http client which is not available in CLI context
    // This would need to be implemented with proper HTTP client setup
    throw new Error('pull command requires HTTP client and is not available in CLI context. Use fetch + merge instead.')
  }

  /**
   * Handler for push command
   * @private
   */
  private async _handlePush(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { push } = await import('../commands/push.ts')
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    return push({
      fs: this.repo.fs,
      dir: this.repo.dir ?? undefined,
      gitdir,
      remote: (flags.remote as string) || 'origin',
      ref: positional[0],
      force: (flags.force as boolean) || (flags.f as boolean) || false,
      cache: this.repo.cache,
    })
  }

  /**
   * Handler for fetch command
   * @private
   */
  private async _handleFetch(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { fetch } = await import('../commands/fetch.ts')
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    return fetch({
      fs: this.repo.fs,
      dir: this.repo.dir ?? undefined,
      gitdir,
      remote: (flags.remote as string) || 'origin',
      ref: positional[0],
      cache: this.repo.cache,
    })
  }

  /**
   * Handler for clone command
   * @private
   */
  private async _handleClone(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { clone } = await import('../commands/clone.ts')
    const cwd = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.'
    return clone({
      fs: this.repo.fs,
      dir: positional[1] || cwd,
      url: positional[0],
      ref: flags.ref as string | undefined,
      depth: flags.depth as number | undefined,
      singleBranch: flags.singleBranch as boolean | undefined,
      cache: this.repo.cache,
    })
  }

  /**
   * Handler for tag command
   * @private
   */
  private async _handleTag(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { tag } = await import('../commands/tag.ts')
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    return tag({
      fs: this.repo.fs,
      dir: this.repo.dir ?? undefined,
      gitdir,
      ref: positional[0],
      object: flags.object as string | undefined,
      force: (flags.force as boolean) || (flags.f as boolean) || false,
    })
  }

  /**
   * Handler for diff command
   * @private
   */
  private async _handleDiff(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { diff } = await import('../commands/diff.ts')
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    return diff({
      fs: this.repo.fs,
      dir: this.repo.dir ?? undefined,
      gitdir,
      refA: positional[0],
      refB: positional[1],
      filepath: flags.filepath as string | undefined,
      cache: this.repo.cache,
    })
  }

  /**
   * Handler for show command
   * @private
   */
  private async _handleShow(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { show } = await import('../commands/show.ts')
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    return show({
      fs: this.repo.fs,
      dir: this.repo.dir ?? undefined,
      gitdir,
      ref: positional[0] || 'HEAD',
      filepath: flags.filepath as string | undefined,
      cache: this.repo.cache,
    })
  }

  /**
   * Handler for rm command
   * @private
   */
  private async _handleRm(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { remove } = await import('../commands/remove.ts')
    const gitdir = await this.repo.getGitdir()
    // remove expects a single filepath string, not an array
    if (positional.length === 0) {
      throw new Error('filepath is required for remove command')
    }
    return remove({
      fs: this.repo.fs,
      dir: this.repo.dir ?? undefined,
      gitdir,
      filepath: positional[0],
      cache: this.repo.cache,
    })
  }

  /**
   * Handler for remote command
   * @private
   */
  private async _handleRemote(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const gitdir = await this.repo.getGitdir()
    if (flags.add) {
      const { addRemote } = await import('../commands/addRemote.ts')
      return addRemote({
        fs: this.repo.fs,
        dir: this.repo.dir ?? undefined,
        gitdir,
        remote: positional[0],
        url: positional[1],
        force: (flags.force as boolean) || (flags.f as boolean) || false,
      })
    } else if (flags.remove || flags.rm) {
      const { deleteRemote } = await import('../commands/deleteRemote.ts')
      return deleteRemote({
        fs: this.repo.fs,
        dir: this.repo.dir ?? undefined,
        gitdir,
        remote: positional[0],
      })
    } else {
      const { listRemotes } = await import('../commands/listRemotes.ts')
      return listRemotes({
        fs: this.repo.fs,
        dir: this.repo.dir ?? undefined,
        gitdir,
      })
    }
  }

  /**
   * Handler for sparse-checkout command
   * @private
   */
  private async _handleSparseCheckout(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { sparseCheckout } = await import('../commands/sparseCheckout.ts')
    const gitdir = await this.repo.getGitdir()
    assertDefined(gitdir, 'gitdir is required')
    if (flags.init) {
      return sparseCheckout({
        fs: this.repo.fs,
        dir: this.repo.dir ?? undefined,
        gitdir,
        init: true,
        cone: flags.cone as boolean | undefined,
        cache: this.repo.cache,
      })
    } else if (flags.set) {
      return sparseCheckout({
        fs: this.repo.fs,
        dir: this.repo.dir ?? undefined,
        gitdir,
        set: positional,
        cone: flags.cone as boolean | undefined,
        cache: this.repo.cache,
      })
    } else if (flags.list) {
      return sparseCheckout({
        fs: this.repo.fs,
        dir: this.repo.dir ?? undefined,
        gitdir,
        list: true,
      })
    }
    throw new Error('sparse-checkout requires one of: --init, --set, or --list')
  }

  /**
   * Handler for ungit command
   * @private
   */
  private async _handleUngit(flags: Record<string, unknown>, positional: string[]): Promise<unknown> {
    const { ungit } = await import('../commands/ungit.ts')
    const cwd = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.'
    return ungit({
      fs: this.repo.fs,
      dir: positional[1] || cwd,
      url: positional[0],
      ref: (flags.ref as string) || 'HEAD',
      sparsePath: flags.sparsePath as string | string[] | undefined,
      cone: (flags.cone as boolean) ?? true,
      depth: flags.depth as number | undefined,
      singleBranch: (flags.singleBranch as boolean) ?? true,
      cache: this.repo.cache,
    })
  }
}

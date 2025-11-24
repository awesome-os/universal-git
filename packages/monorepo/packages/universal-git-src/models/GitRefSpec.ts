import { InternalError } from '../errors/InternalError.ts'

export class GitRefSpec {
  remotePath: string
  localPath: string
  force: boolean
  matchPrefix: boolean

  constructor({
    remotePath,
    localPath,
    force,
    matchPrefix,
  }: {
    remotePath: string
    localPath: string
    force: boolean
    matchPrefix: boolean
  }) {
    this.remotePath = remotePath
    this.localPath = localPath
    this.force = force
    this.matchPrefix = matchPrefix
  }

  static from(refspec: string): GitRefSpec {
    const match = refspec.match(/^(\+?)(.*?)(\*?):(.*?)(\*?)$/)
    if (!match) {
      throw new InternalError('Invalid refspec format')
    }
    const [, forceMatch, remotePath, remoteGlobMatch, localPath, localGlobMatch] = match
    const force = forceMatch === '+'
    const remoteIsGlob = remoteGlobMatch === '*'
    const localIsGlob = localGlobMatch === '*'
    // validate
    // TODO: Make this check more nuanced, and depend on whether this is a fetch refspec or a push refspec
    if (remoteIsGlob !== localIsGlob) {
      throw new InternalError('Invalid refspec')
    }
    return new GitRefSpec({
      remotePath,
      localPath,
      force,
      matchPrefix: remoteIsGlob,
    })
    // TODO: We need to run resolveRef on both paths to expand them to their full name.
  }

  translate(remoteBranch: string): string | null {
    if (this.matchPrefix) {
      if (remoteBranch.startsWith(this.remotePath)) {
        return this.localPath + remoteBranch.replace(this.remotePath, '')
      }
    } else {
      if (remoteBranch === this.remotePath) return this.localPath
    }
    return null
  }

  reverseTranslate(localBranch: string): string | null {
    if (this.matchPrefix) {
      if (localBranch.startsWith(this.localPath)) {
        return this.remotePath + localBranch.replace(this.localPath, '')
      }
    } else {
      if (localBranch === this.localPath) return this.remotePath
    }
    return null
  }
}


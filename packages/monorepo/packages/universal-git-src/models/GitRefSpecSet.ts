import { GitRefSpec } from './GitRefSpec.ts'

export class GitRefSpecSet {
  rules: GitRefSpec[]

  constructor(rules: GitRefSpec[] = []) {
    this.rules = rules
  }

  static from(refspecs: string[]): GitRefSpecSet {
    const rules: GitRefSpec[] = []
    for (const refspec of refspecs) {
      rules.push(GitRefSpec.from(refspec)) // might throw
    }
    return new GitRefSpecSet(rules)
  }

  add(refspec: string): void {
    const rule = GitRefSpec.from(refspec) // might throw
    this.rules.push(rule)
  }

  translate(remoteRefs: string[]): Array<[string, string]> {
    const result: Array<[string, string]> = []
    for (const rule of this.rules) {
      for (const remoteRef of remoteRefs) {
        const localRef = rule.translate(remoteRef)
        if (localRef) {
          result.push([remoteRef, localRef])
        }
      }
    }
    return result
  }

  translateOne(remoteRef: string): string | null {
    let result: string | null = null
    for (const rule of this.rules) {
      const localRef = rule.translate(remoteRef)
      if (localRef) {
        result = localRef
      }
    }
    return result
  }

  localNamespaces(): string[] {
    return this.rules
      .filter(rule => rule.matchPrefix)
      .map(rule => rule.localPath.replace(/\/$/, ''))
  }
}


import type { CommitObject } from "../models/GitCommit.ts"

export const compareAge = (a: CommitObject, b: CommitObject): number => {
  return a.committer.timestamp - b.committer.timestamp
}


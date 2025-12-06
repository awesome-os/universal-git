import { BaseError } from './BaseError.ts'

export class UnmergedPathsError extends BaseError {
  static readonly code = 'UnmergedPathsError' as const

  constructor(filepaths: string[], cause?: Error) {
    super(
      `Modifying the index is not possible because you have unmerged files: ${filepaths.toString()}. Fix them up in the work tree, and then use 'git add/rm as appropriate to mark resolution and make a commit.`,
      cause
    )
    this.code = this.name = UnmergedPathsError.code
    this.data = { filepaths }
  }
}


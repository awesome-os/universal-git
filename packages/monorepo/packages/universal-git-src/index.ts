import { STAGE } from './commands/STAGE.ts'
import { TREE } from './commands/TREE.ts'
import { WORKDIR } from './commands/WORKDIR.ts'
import { abortMerge } from './commands/abortMerge.ts'
import { add } from './commands/add.ts'
import { addNote } from './commands/addNote.ts'
import { addRemote } from './commands/addRemote.ts'
import { annotatedTag } from './commands/annotatedTag.ts'
import { branch } from './commands/branch.ts'
import { checkout } from './commands/checkout.ts'
import { clone } from './commands/clone.ts'
import { commit } from './commands/commit.ts'
import { currentBranch } from './commands/currentBranch.ts'
import { deleteBranch } from './commands/deleteBranch.ts'
import { deleteRef } from './commands/deleteRef.ts'
import { deleteRemote } from './commands/deleteRemote.ts'
import { deleteTag } from './commands/deleteTag.ts'
import { diff } from './commands/diff.ts'
import { expandOid } from './commands/expandOid.ts'
import { expandRef } from './commands/expandRef.ts'
import { fastForward } from './commands/fastForward.ts'
import { fetch } from './commands/fetch.ts'
import { findMergeBase } from './commands/findMergeBase.ts'
import { findRoot } from './commands/findRoot.ts'
import { getConfig } from './commands/getConfig.ts'
import { getConfigAll } from './commands/getConfigAll.ts'
import { deleteConfig } from './commands/deleteConfig.ts'
import { getRemoteInfo } from './commands/getRemoteInfo.ts'
import { hashBlob } from './commands/hashBlob.ts'
import { indexPack } from './commands/indexPack.ts'
import { init } from './commands/init.ts'
import { isDescendent } from './commands/isDescendent.ts'
import { isIgnored } from './commands/isIgnored.ts'
import { listBranches } from './commands/listBranches.ts'
import { listFiles } from './commands/listFiles.ts'
import { listNotes } from './commands/listNotes.ts'
import { listRefs } from './commands/listRefs.ts'
import { listRemotes } from './commands/listRemotes.ts'
import { listServerRefs } from './commands/listServerRefs.ts'
import { listTags } from './commands/listTags.ts'
import { log } from './commands/log.ts'
import { merge } from './commands/merge.ts'
import { packObjects } from './commands/packObjects.ts'
import { bundle, verifyBundle, unbundle } from './commands/bundle.ts'
import { pull } from './commands/pull.ts'
import { push } from './commands/push.ts'
import { readBlob } from './commands/readBlob.ts'
import { readCommit } from './commands/readCommit.ts'
import { readNote } from './commands/readNote.ts'
import { readObject } from './commands/readObject.ts'
import { readTag } from './commands/readTag.ts'
import { readTree } from './commands/readTree.ts'
import { remove } from './commands/remove.ts'
import { removeNote } from './commands/removeNote.ts'
import { renameBranch } from './commands/renameBranch.ts'
import { resetIndex } from './commands/resetIndex.ts'
import { resetToCommit } from './commands/reset.ts'
import { resolveRef } from './commands/resolveRef.ts'
import { setConfig } from './commands/setConfig.ts'
import { rebase } from './commands/rebase.ts'
import { cherryPick } from './commands/cherryPick.ts'
import { sparseCheckout } from './commands/sparseCheckout.ts'
import { submodule } from './commands/submodule.ts'
import { worktree } from './commands/worktree.ts'
import { lfs } from './commands/lfs.ts'
import { stash } from './commands/stash.ts'
import { status } from './commands/status.ts'
import { statusMatrix } from './commands/statusMatrix.ts'
import { tag } from './commands/tag.ts'
import { ungit } from './commands/ungit.ts'
import { updateIndex } from './commands/updateIndex.ts'
import { version } from './utils/version.ts'
import { walk } from './commands/walk.ts'
import { writeBlob } from './commands/writeBlob.ts'
import { writeCommit } from './commands/writeCommit.ts'
import { writeRef } from './commands/writeRef.ts'
import { writeTag } from './commands/writeTag.ts'
import { writeTree } from './commands/writeTree.ts'
import * as Errors from './errors/index.ts'

// named exports
export {
  Errors,
  STAGE,
  TREE,
  WORKDIR,
  abortMerge,
  add,
  addNote,
  addRemote,
  annotatedTag,
  branch,
  checkout,
  clone,
  commit,
  getConfig,
  getConfigAll,
  setConfig,
  deleteConfig,
  currentBranch,
  deleteBranch,
  deleteRef,
  deleteRemote,
  deleteTag,
  diff,
  expandOid,
  expandRef,
  fastForward,
  fetch,
  findMergeBase,
  findRoot,
  getRemoteInfo,
  hashBlob,
  indexPack,
  init,
  isDescendent,
  isIgnored,
  listBranches,
  listFiles,
  listNotes,
  listRefs,
  listRemotes,
  listServerRefs,
  listTags,
  log,
  merge,
  packObjects,
  bundle,
  verifyBundle,
  unbundle,
  pull,
  push,
  readBlob,
  readCommit,
  readNote,
  readObject,
  readTag,
  readTree,
  remove,
  removeNote,
  renameBranch,
  resetIndex,
  resetToCommit,
  updateIndex,
  resolveRef,
  rebase,
  cherryPick,
  status,
  statusMatrix,
  sparseCheckout,
  submodule,
  worktree,
  lfs,
  tag,
  ungit,
  version,
  walk,
  writeBlob,
  writeCommit,
  writeRef,
  writeTag,
  writeTree,
  stash,
}

// Export types
export type { SubmoduleStatus } from './commands/submodule.ts'

// Export UniversalBuffer for external use
export { UniversalBuffer } from './utils/UniversalBuffer.ts'
export type { UniversalBufferLike } from './utils/UniversalBuffer.ts'

// Export UniversalTransport layer
export * from './transport/index.ts'

// Export Worker infrastructure
export * from './workers/index.ts'

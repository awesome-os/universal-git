/**
 * Git Index Operations
 * Direct operations on .git/index file
 * 
 * The index (staging area) is a binary file that tracks files for the next commit.
 * This module provides direct read/write operations on the index file.
 */

export { readIndex } from './readIndex.ts'
export { writeIndex } from './writeIndex.ts'
export { GitIndex } from './GitIndex.ts'


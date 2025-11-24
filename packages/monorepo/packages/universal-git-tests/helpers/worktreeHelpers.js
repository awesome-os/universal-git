"use strict";
/**
 * Worktree Test Helpers
 *
 * Provides utility functions for managing worktrees in tests.
 * These helpers ensure test isolation by properly cleaning up worktrees
 * and generating unique worktree paths.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupWorktrees = cleanupWorktrees;
exports.createWorktreePath = createWorktreePath;
exports.commitInWorktree = commitInWorktree;
var worktree_ts_1 = require("@awesome-os/universal-git-src/commands/worktree.ts");
var join_ts_1 = require("@awesome-os/universal-git-src/utils/join.ts");
var os_1 = require("os");
/**
 * Clean up all worktrees except the main worktree
 *
 * This helper ensures test isolation by removing all worktrees created during tests.
 * It should be called in test teardown (try...finally blocks) to guarantee clean state.
 *
 * @param fs - File system client
 * @param dir - Main worktree directory
 * @param gitdir - Git directory path
 */
function cleanupWorktrees(fs, dir, gitdir) {
    return __awaiter(this, void 0, void 0, function () {
        var worktrees, _i, worktrees_1, wt, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 9, , 10]);
                    return [4 /*yield*/, (0, worktree_ts_1.worktree)({ fs: fs, dir: dir, gitdir: gitdir, list: true })];
                case 1:
                    worktrees = (_c.sent());
                    _i = 0, worktrees_1 = worktrees;
                    _c.label = 2;
                case 2:
                    if (!(_i < worktrees_1.length)) return [3 /*break*/, 7];
                    wt = worktrees_1[_i];
                    if (!(wt.path !== dir)) return [3 /*break*/, 6];
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, (0, worktree_ts_1.worktree)({ fs: fs, dir: dir, gitdir: gitdir, remove: true, path: wt.path, force: true })];
                case 4:
                    _c.sent();
                    return [3 /*break*/, 6];
                case 5:
                    _a = _c.sent();
                    return [3 /*break*/, 6];
                case 6:
                    _i++;
                    return [3 /*break*/, 2];
                case 7: 
                // Prune any stale worktrees
                return [4 /*yield*/, (0, worktree_ts_1.worktree)({ fs: fs, dir: dir, gitdir: gitdir, prune: true }).catch(function () {
                        // Ignore prune errors
                    })];
                case 8:
                    // Prune any stale worktrees
                    _c.sent();
                    return [3 /*break*/, 10];
                case 9:
                    _b = _c.sent();
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
/**
 * Create a unique worktree path for testing
 *
 * Creates worktrees in a dedicated test directory (system temp directory)
 * to avoid polluting the project root or fixture directories.
 *
 * @param baseDir - Base directory for worktrees (used to determine relative location)
 * @param prefix - Prefix for the worktree name (default: 'worktree')
 * @returns Unique worktree path in system temp directory
 */
function createWorktreePath(baseDir, prefix) {
    if (prefix === void 0) { prefix = 'worktree'; }
    var uniqueId = "".concat(Date.now(), "-").concat(Math.random().toString(36).substring(7));
    // Use system temp directory to avoid creating files in project root
    // This matches the pattern used by makeNodeFixture for test fixtures
    var testWorktreeDir = (0, join_ts_1.join)((0, os_1.tmpdir)(), 'ugit-test-worktrees');
    return (0, join_ts_1.join)(testWorktreeDir, "".concat(prefix, "-").concat(uniqueId));
}
/**
 * Commit in a worktree with proper symbolic HEAD setup
 *
 * CRITICAL: When committing in a worktree, the worktree's HEAD must be set as a symbolic ref
 * pointing to the branch. Otherwise, commits will only update the worktree's detached HEAD,
 * not the branch ref. This helper encapsulates that logic to avoid repeating it.
 *
 * @param repo - Main repository instance
 * @param worktreePath - Path to the worktree directory
 * @param message - Commit message
 * @param author - Author information (optional)
 * @param branch - Branch name (optional, will be detected from worktree if not provided)
 * @returns Promise resolving to the commit OID
 */
function commitInWorktree(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var Repository, mainGitdir, worktreeRepo, worktreeGitdir, branchName, currentBranch, currentBranchName, writeSymbolicRef, resolveRef, fullBranchRef, branchOid, _c, commit;
        var repo = _b.repo, worktreePath = _b.worktreePath, message = _b.message, author = _b.author, branch = _b.branch;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('@awesome-os/universal-git-src/core-utils/Repository.ts'); })];
                case 1:
                    Repository = (_d.sent()).Repository;
                    return [4 /*yield*/, repo.getGitdir()
                        // Open repository for the worktree
                    ];
                case 2:
                    mainGitdir = _d.sent();
                    return [4 /*yield*/, Repository.open({
                            fs: repo.fs,
                            dir: worktreePath,
                            gitdir: mainGitdir,
                            cache: repo.cache,
                            autoDetectConfig: true,
                        })];
                case 3:
                    worktreeRepo = _d.sent();
                    return [4 /*yield*/, worktreeRepo.getGitdir()
                        // Get branch name from worktree or use provided branch
                    ];
                case 4:
                    worktreeGitdir = _d.sent();
                    branchName = branch;
                    if (!!branchName) return [3 /*break*/, 7];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('@awesome-os/universal-git-src/commands/currentBranch.ts'); })];
                case 5:
                    currentBranch = (_d.sent()).currentBranch;
                    return [4 /*yield*/, currentBranch({
                            fs: repo.fs,
                            dir: worktreePath,
                            gitdir: mainGitdir,
                        })];
                case 6:
                    currentBranchName = _d.sent();
                    if (currentBranchName) {
                        branchName = currentBranchName;
                    }
                    _d.label = 7;
                case 7:
                    if (!branchName) return [3 /*break*/, 15];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('@awesome-os/universal-git-src/git/refs/writeRef.ts'); })];
                case 8:
                    writeSymbolicRef = (_d.sent()).writeSymbolicRef;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('@awesome-os/universal-git-src/git/refs/readRef.ts'); })];
                case 9:
                    resolveRef = (_d.sent()).resolveRef;
                    fullBranchRef = branchName.startsWith('refs/heads/')
                        ? branchName
                        : "refs/heads/".concat(branchName);
                    _d.label = 10;
                case 10:
                    _d.trys.push([10, 13, , 15]);
                    return [4 /*yield*/, resolveRef({
                            fs: repo.fs,
                            gitdir: mainGitdir,
                            ref: fullBranchRef,
                        })];
                case 11:
                    branchOid = _d.sent();
                    return [4 /*yield*/, writeSymbolicRef({
                            fs: repo.fs,
                            gitdir: worktreeGitdir,
                            ref: 'HEAD',
                            value: fullBranchRef,
                            oldOid: branchOid,
                        })];
                case 12:
                    _d.sent();
                    return [3 /*break*/, 15];
                case 13:
                    _c = _d.sent();
                    // If branch doesn't exist yet, that's okay - it will be created by the commit
                    // Still set the symbolic ref so the commit updates the branch
                    return [4 /*yield*/, writeSymbolicRef({
                            fs: repo.fs,
                            gitdir: worktreeGitdir,
                            ref: 'HEAD',
                            value: fullBranchRef,
                        })];
                case 14:
                    // If branch doesn't exist yet, that's okay - it will be created by the commit
                    // Still set the symbolic ref so the commit updates the branch
                    _d.sent();
                    return [3 /*break*/, 15];
                case 15: return [4 /*yield*/, Promise.resolve().then(function () { return require('@awesome-os/universal-git-src/commands/commit.ts'); })];
                case 16:
                    commit = (_d.sent()).commit;
                    return [4 /*yield*/, commit({
                            fs: repo.fs,
                            dir: worktreePath,
                            gitdir: mainGitdir,
                            message: message,
                            author: author,
                            cache: repo.cache,
                        })];
                case 17: return [2 /*return*/, _d.sent()];
            }
        });
    });
}

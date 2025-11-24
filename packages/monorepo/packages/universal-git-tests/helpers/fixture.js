"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.makeFixture = makeFixture;
exports.resetToCommit = resetToCommit;
var makeNodeFixture_ts_1 = require("./makeNodeFixture.ts");
var reset_ts_1 = require("@awesome-os/universal-git-src/commands/reset.ts");
/**
 * Creates a test fixture for Node.js test runner
 * @param fixtureName - Name of the fixture directory
 * @returns Promise resolving to fixture with fs, dir, and gitdir
 */
function makeFixture(fixtureName) {
    return __awaiter(this, void 0, void 0, function () {
        var fixture, result, indexPath, stats, _a, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, makeNodeFixture_ts_1.makeNodeFixture)(fixtureName)
                    // FileSystem implements FsClient interface, but TypeScript needs explicit cast
                ];
                case 1:
                    fixture = _b.sent();
                    result = __assign(__assign({}, fixture), { fs: fixture.fs });
                    if (!(fixtureName === 'test-empty' && fixture.gitdir)) return [3 /*break*/, 10];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 9, , 10]);
                    indexPath = "".concat(fixture.gitdir, "/index");
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 7, , 8]);
                    return [4 /*yield*/, result.fs.lstat(indexPath)];
                case 4:
                    stats = _b.sent();
                    if (!stats) return [3 /*break*/, 6];
                    // File exists, delete it
                    return [4 /*yield*/, result.fs.rm(indexPath)];
                case 5:
                    // File exists, delete it
                    _b.sent();
                    _b.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    _a = _b.sent();
                    return [3 /*break*/, 8];
                case 8: return [3 /*break*/, 10];
                case 9:
                    error_1 = _b.sent();
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/, result];
            }
        });
    });
}
/**
 * Resets the fixture to a clean state matching a specific commit.
 * This ensures HEAD, the index, and the working directory are all in sync.
 *
 * This is a wrapper around the git.resetToCommit utility function.
 * It provides a convenient interface for test fixtures.
 *
 * @param fs - File system client
 * @param dir - Working directory path
 * @param gitdir - Git directory path (optional, defaults to join(dir, '.git'))
 * @param ref - Reference or OID to reset to (defaults to 'HEAD')
 * @param cache - Cache object to use (optional, defaults to empty object)
 *                IMPORTANT: Pass the same cache used by other git commands in your test
 *                to ensure state consistency across operations
 */
function resetToCommit(fs_1, dir_1, gitdir_1) {
    return __awaiter(this, arguments, void 0, function (fs, dir, gitdir, ref, cache) {
        if (ref === void 0) { ref = 'HEAD'; }
        if (cache === void 0) { cache = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // Use the utility function from universal-git
                // This ensures proper branch state (HEAD is not detached)
                return [4 /*yield*/, (0, reset_ts_1.resetToCommit)({
                        fs: fs,
                        dir: dir,
                        gitdir: gitdir,
                        ref: ref,
                        cache: cache,
                    })];
                case 1:
                    // Use the utility function from universal-git
                    // This ensures proper branch state (HEAD is not detached)
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}

"use strict";
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
exports.cleanupTempDirs = cleanupTempDirs;
exports.useTempDir = useTempDir;
exports.makeNodeFixture = makeNodeFixture;
var _fs = require("fs");
var os = require("os");
var path_1 = require("path");
var find_up_1 = require("find-up");
var FileSystem_ts_1 = require("@awesome-os/universal-git-src/models/FileSystem.ts");
var signal_exit_1 = require("signal-exit");
var TEMP_PATH = (0, path_1.join)(os.tmpdir(), 'ugit-test-fixture-');
var TEMP_DIRS_CREATED = new Set();
function cleanupTempDirs() {
    for (var _i = 0, TEMP_DIRS_CREATED_1 = TEMP_DIRS_CREATED; _i < TEMP_DIRS_CREATED_1.length; _i++) {
        var tempDir = TEMP_DIRS_CREATED_1[_i];
        try {
            _fs.rmSync(tempDir, { recursive: true, force: true });
        }
        catch (err) {
            // Ignore errors during cleanup
        }
    }
    TEMP_DIRS_CREATED.clear();
}
var helpersDir = (0, path_1.resolve)(__dirname, '..'); // packages/universal-git-test-helpers
var packagesRoot = (0, path_1.resolve)(helpersDir, '..'); // packages
var fixturesPackageRoot = (0, path_1.resolve)(packagesRoot, 'universal-git-test-fixtures'); // packages/universal-git-test-fixtures
var fixturesDir = (0, path_1.resolve)(fixturesPackageRoot, 'fixtures'); // packages/universal-git-test-fixtures/fixtures
function useTempDir(fixture) {
    return __awaiter(this, void 0, void 0, function () {
        var directPath, fixturePath, stats, tempDir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    directPath = (0, path_1.join)(fixturesDir, fixture);
                    return [4 /*yield*/, _fs.promises.stat(directPath).catch(function () { return null; })];
                case 1:
                    stats = _a.sent();
                    if (stats && stats.isDirectory()) {
                        fixturePath = directPath;
                    }
                    else {
                        return [4 /*yield*/, (0, find_up_1.default)(fixture, {
                                cwd: fixturesDir,
                                type: 'directory',
                            })];
                    }
                case 2:
                    if (!stats || !stats.isDirectory()) {
                        fixturePath = _a.sent() || undefined;
                    }
                    return [4 /*yield*/, _fs.promises.mkdtemp(TEMP_PATH)];
                case 3:
                    tempDir = _a.sent();
                    TEMP_DIRS_CREATED.add(tempDir);
                    if (!fixturePath) return [3 /*break*/, 5];
                    return [4 /*yield*/, _fs.promises.cp(fixturePath, tempDir, { recursive: true })];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5: return [2 /*return*/, tempDir];
            }
        });
    });
}
function makeNodeFixture(fixture) {
    return __awaiter(this, void 0, void 0, function () {
        var fs, dir, gitdir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    (0, signal_exit_1.default)(cleanupTempDirs);
                    fs = new FileSystem_ts_1.FileSystem(_fs);
                    return [4 /*yield*/, useTempDir(fixture)];
                case 1:
                    dir = _a.sent();
                    return [4 /*yield*/, useTempDir("".concat(fixture, ".git"))];
                case 2:
                    gitdir = _a.sent();
                    return [2 /*return*/, { _fs: _fs, fs: fs, dir: dir, gitdir: gitdir }];
            }
        });
    });
}

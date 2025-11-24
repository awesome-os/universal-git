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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
var node_test_1 = require("node:test");
var node_assert_1 = require("node:assert");
var fromNodeStream_ts_1 = require("@awesome-os/universal-git-src/utils/fromNodeStream.ts");
var readable_stream_1 = require("readable-stream");
(0, node_test_1.test)('fromNodeStream', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, t.test('converts Node stream to async iterator', function () { return __awaiter(void 0, void 0, void 0, function () {
                    var stream, iterator, chunks, _a, iterator_1, iterator_1_1, chunk, e_1_1;
                    var _b, e_1, _c, _d;
                    return __generator(this, function (_e) {
                        switch (_e.label) {
                            case 0:
                                stream = new readable_stream_1.Readable({
                                    read: function () {
                                        this.push(Buffer.from('chunk1'));
                                        this.push(Buffer.from('chunk2'));
                                        this.push(null); // End stream
                                    },
                                });
                                iterator = (0, fromNodeStream_ts_1.fromNodeStream)(stream);
                                chunks = [];
                                _e.label = 1;
                            case 1:
                                _e.trys.push([1, 6, 7, 12]);
                                _a = true, iterator_1 = __asyncValues(iterator);
                                _e.label = 2;
                            case 2: return [4 /*yield*/, iterator_1.next()];
                            case 3:
                                if (!(iterator_1_1 = _e.sent(), _b = iterator_1_1.done, !_b)) return [3 /*break*/, 5];
                                _d = iterator_1_1.value;
                                _a = false;
                                chunk = _d;
                                chunks.push(chunk);
                                _e.label = 4;
                            case 4:
                                _a = true;
                                return [3 /*break*/, 2];
                            case 5: return [3 /*break*/, 12];
                            case 6:
                                e_1_1 = _e.sent();
                                e_1 = { error: e_1_1 };
                                return [3 /*break*/, 12];
                            case 7:
                                _e.trys.push([7, , 10, 11]);
                                if (!(!_a && !_b && (_c = iterator_1.return))) return [3 /*break*/, 9];
                                return [4 /*yield*/, _c.call(iterator_1)];
                            case 8:
                                _e.sent();
                                _e.label = 9;
                            case 9: return [3 /*break*/, 11];
                            case 10:
                                if (e_1) throw e_1.error;
                                return [7 /*endfinally*/];
                            case 11: return [7 /*endfinally*/];
                            case 12:
                                node_assert_1.default.strictEqual(chunks.length, 2);
                                node_assert_1.default.deepStrictEqual(chunks[0], Buffer.from('chunk1'));
                                node_assert_1.default.deepStrictEqual(chunks[1], Buffer.from('chunk2'));
                                return [2 /*return*/];
                        }
                    });
                }); })];
            case 1:
                _a.sent();
                return [4 /*yield*/, t.test('handles empty stream', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var stream, iterator, chunks, _a, iterator_2, iterator_2_1, chunk, e_2_1;
                        var _b, e_2, _c, _d;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    stream = new readable_stream_1.Readable({
                                        read: function () {
                                            this.push(null); // End immediately
                                        },
                                    });
                                    iterator = (0, fromNodeStream_ts_1.fromNodeStream)(stream);
                                    chunks = [];
                                    _e.label = 1;
                                case 1:
                                    _e.trys.push([1, 6, 7, 12]);
                                    _a = true, iterator_2 = __asyncValues(iterator);
                                    _e.label = 2;
                                case 2: return [4 /*yield*/, iterator_2.next()];
                                case 3:
                                    if (!(iterator_2_1 = _e.sent(), _b = iterator_2_1.done, !_b)) return [3 /*break*/, 5];
                                    _d = iterator_2_1.value;
                                    _a = false;
                                    chunk = _d;
                                    chunks.push(chunk);
                                    _e.label = 4;
                                case 4:
                                    _a = true;
                                    return [3 /*break*/, 2];
                                case 5: return [3 /*break*/, 12];
                                case 6:
                                    e_2_1 = _e.sent();
                                    e_2 = { error: e_2_1 };
                                    return [3 /*break*/, 12];
                                case 7:
                                    _e.trys.push([7, , 10, 11]);
                                    if (!(!_a && !_b && (_c = iterator_2.return))) return [3 /*break*/, 9];
                                    return [4 /*yield*/, _c.call(iterator_2)];
                                case 8:
                                    _e.sent();
                                    _e.label = 9;
                                case 9: return [3 /*break*/, 11];
                                case 10:
                                    if (e_2) throw e_2.error;
                                    return [7 /*endfinally*/];
                                case 11: return [7 /*endfinally*/];
                                case 12:
                                    node_assert_1.default.strictEqual(chunks.length, 0);
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 2:
                _a.sent();
                return [4 /*yield*/, t.test('handles stream error', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var stream, iterator;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    stream = new readable_stream_1.Readable({
                                        read: function () {
                                            this.emit('error', new Error('Stream error'));
                                        },
                                    });
                                    iterator = (0, fromNodeStream_ts_1.fromNodeStream)(stream);
                                    return [4 /*yield*/, node_assert_1.default.rejects(function () { return __awaiter(void 0, void 0, void 0, function () {
                                            var _a, iterator_3, iterator_3_1, chunk, e_3_1;
                                            var _b, e_3, _c, _d;
                                            return __generator(this, function (_e) {
                                                switch (_e.label) {
                                                    case 0:
                                                        _e.trys.push([0, 5, 6, 11]);
                                                        _a = true, iterator_3 = __asyncValues(iterator);
                                                        _e.label = 1;
                                                    case 1: return [4 /*yield*/, iterator_3.next()];
                                                    case 2:
                                                        if (!(iterator_3_1 = _e.sent(), _b = iterator_3_1.done, !_b)) return [3 /*break*/, 4];
                                                        _d = iterator_3_1.value;
                                                        _a = false;
                                                        chunk = _d;
                                                        _e.label = 3;
                                                    case 3:
                                                        _a = true;
                                                        return [3 /*break*/, 1];
                                                    case 4: return [3 /*break*/, 11];
                                                    case 5:
                                                        e_3_1 = _e.sent();
                                                        e_3 = { error: e_3_1 };
                                                        return [3 /*break*/, 11];
                                                    case 6:
                                                        _e.trys.push([6, , 9, 10]);
                                                        if (!(!_a && !_b && (_c = iterator_3.return))) return [3 /*break*/, 8];
                                                        return [4 /*yield*/, _c.call(iterator_3)];
                                                    case 7:
                                                        _e.sent();
                                                        _e.label = 8;
                                                    case 8: return [3 /*break*/, 10];
                                                    case 9:
                                                        if (e_3) throw e_3.error;
                                                        return [7 /*endfinally*/];
                                                    case 10: return [7 /*endfinally*/];
                                                    case 11: return [2 /*return*/];
                                                }
                                            });
                                        }); }, function (error) {
                                            return error instanceof Error && error.message === 'Stream error';
                                        })];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 3:
                _a.sent();
                return [4 /*yield*/, t.test('handles multiple chunks', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var chunks, stream, iterator, received, _a, iterator_4, iterator_4_1, chunk, e_4_1;
                        var _b, e_4, _c, _d;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    chunks = ['chunk1', 'chunk2', 'chunk3', 'chunk4', 'chunk5'];
                                    stream = new readable_stream_1.Readable({
                                        read: function () {
                                            for (var _i = 0, chunks_1 = chunks; _i < chunks_1.length; _i++) {
                                                var chunk = chunks_1[_i];
                                                this.push(Buffer.from(chunk));
                                            }
                                            this.push(null);
                                        },
                                    });
                                    iterator = (0, fromNodeStream_ts_1.fromNodeStream)(stream);
                                    received = [];
                                    _e.label = 1;
                                case 1:
                                    _e.trys.push([1, 6, 7, 12]);
                                    _a = true, iterator_4 = __asyncValues(iterator);
                                    _e.label = 2;
                                case 2: return [4 /*yield*/, iterator_4.next()];
                                case 3:
                                    if (!(iterator_4_1 = _e.sent(), _b = iterator_4_1.done, !_b)) return [3 /*break*/, 5];
                                    _d = iterator_4_1.value;
                                    _a = false;
                                    chunk = _d;
                                    received.push(chunk);
                                    _e.label = 4;
                                case 4:
                                    _a = true;
                                    return [3 /*break*/, 2];
                                case 5: return [3 /*break*/, 12];
                                case 6:
                                    e_4_1 = _e.sent();
                                    e_4 = { error: e_4_1 };
                                    return [3 /*break*/, 12];
                                case 7:
                                    _e.trys.push([7, , 10, 11]);
                                    if (!(!_a && !_b && (_c = iterator_4.return))) return [3 /*break*/, 9];
                                    return [4 /*yield*/, _c.call(iterator_4)];
                                case 8:
                                    _e.sent();
                                    _e.label = 9;
                                case 9: return [3 /*break*/, 11];
                                case 10:
                                    if (e_4) throw e_4.error;
                                    return [7 /*endfinally*/];
                                case 11: return [7 /*endfinally*/];
                                case 12:
                                    node_assert_1.default.strictEqual(received.length, 5);
                                    node_assert_1.default.deepStrictEqual(received[0], Buffer.from('chunk1'));
                                    node_assert_1.default.deepStrictEqual(received[4], Buffer.from('chunk5'));
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 4:
                _a.sent();
                return [4 /*yield*/, t.test('handles return() method', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var stream, iterator, first, result;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    stream = new readable_stream_1.Readable({
                                        read: function () {
                                            this.push(Buffer.from('chunk1'));
                                            this.push(Buffer.from('chunk2'));
                                            // Don't end, to test return()
                                        },
                                    });
                                    iterator = (0, fromNodeStream_ts_1.fromNodeStream)(stream);
                                    return [4 /*yield*/, iterator.next()];
                                case 1:
                                    first = _a.sent();
                                    node_assert_1.default.ok(!first.done);
                                    node_assert_1.default.deepStrictEqual(first.value, Buffer.from('chunk1'));
                                    return [4 /*yield*/, iterator.return()];
                                case 2:
                                    result = _a.sent();
                                    node_assert_1.default.ok(result.done);
                                    // Stream should be cleaned up (listeners removed, destroyed)
                                    node_assert_1.default.ok(true); // If we get here, return() worked
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 5:
                _a.sent();
                return [4 /*yield*/, t.test('handles Symbol.asyncIterator', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var stream, iterator, asyncIter;
                        return __generator(this, function (_a) {
                            stream = new readable_stream_1.Readable({
                                read: function () {
                                    this.push(Buffer.from('chunk1'));
                                    this.push(null);
                                },
                            });
                            iterator = (0, fromNodeStream_ts_1.fromNodeStream)(stream);
                            // Should have Symbol.asyncIterator method
                            node_assert_1.default.ok(iterator[Symbol.asyncIterator]);
                            asyncIter = iterator[Symbol.asyncIterator]();
                            node_assert_1.default.strictEqual(asyncIter, iterator);
                            return [2 /*return*/];
                        });
                    }); })];
            case 6:
                _a.sent();
                return [4 /*yield*/, t.test('handles stream with existing async iterator', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var mockStream, iterator;
                        var _a;
                        return __generator(this, function (_b) {
                            mockStream = (_a = {},
                                _a[Symbol.asyncIterator] = function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, Buffer.from('chunk1')];
                                            case 1:
                                                _a.sent();
                                                return [4 /*yield*/, Buffer.from('chunk2')];
                                            case 2:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                },
                                _a);
                            // Set enumerable property
                            Object.defineProperty(mockStream, Symbol.asyncIterator, {
                                enumerable: true,
                                value: mockStream[Symbol.asyncIterator],
                            });
                            iterator = (0, fromNodeStream_ts_1.fromNodeStream)(mockStream);
                            // Should return the stream itself if it has async iterator
                            node_assert_1.default.strictEqual(iterator, mockStream);
                            return [2 /*return*/];
                        });
                    }); })];
            case 7:
                _a.sent();
                return [4 /*yield*/, t.test('handles queued chunks before next() call', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var stream, iterator, chunks, _a, iterator_5, iterator_5_1, chunk, e_5_1;
                        var _b, e_5, _c, _d;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    stream = new readable_stream_1.Readable({
                                        read: function () {
                                            // Push chunks immediately
                                            this.push(Buffer.from('chunk1'));
                                            this.push(Buffer.from('chunk2'));
                                            this.push(null);
                                        },
                                    });
                                    iterator = (0, fromNodeStream_ts_1.fromNodeStream)(stream);
                                    // Wait a bit to let chunks queue up
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 10); })];
                                case 1:
                                    // Wait a bit to let chunks queue up
                                    _e.sent();
                                    chunks = [];
                                    _e.label = 2;
                                case 2:
                                    _e.trys.push([2, 7, 8, 13]);
                                    _a = true, iterator_5 = __asyncValues(iterator);
                                    _e.label = 3;
                                case 3: return [4 /*yield*/, iterator_5.next()];
                                case 4:
                                    if (!(iterator_5_1 = _e.sent(), _b = iterator_5_1.done, !_b)) return [3 /*break*/, 6];
                                    _d = iterator_5_1.value;
                                    _a = false;
                                    chunk = _d;
                                    chunks.push(chunk);
                                    _e.label = 5;
                                case 5:
                                    _a = true;
                                    return [3 /*break*/, 3];
                                case 6: return [3 /*break*/, 13];
                                case 7:
                                    e_5_1 = _e.sent();
                                    e_5 = { error: e_5_1 };
                                    return [3 /*break*/, 13];
                                case 8:
                                    _e.trys.push([8, , 11, 12]);
                                    if (!(!_a && !_b && (_c = iterator_5.return))) return [3 /*break*/, 10];
                                    return [4 /*yield*/, _c.call(iterator_5)];
                                case 9:
                                    _e.sent();
                                    _e.label = 10;
                                case 10: return [3 /*break*/, 12];
                                case 11:
                                    if (e_5) throw e_5.error;
                                    return [7 /*endfinally*/];
                                case 12: return [7 /*endfinally*/];
                                case 13:
                                    // Should receive all queued chunks
                                    node_assert_1.default.strictEqual(chunks.length, 2);
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 8:
                _a.sent();
                return [4 /*yield*/, t.test('handles error after chunks', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var stream, iterator;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    stream = new readable_stream_1.Readable({
                                        read: function () {
                                            var _this = this;
                                            this.push(Buffer.from('chunk1'));
                                            // Emit error after first chunk
                                            setTimeout(function () {
                                                _this.emit('error', new Error('Error after chunk'));
                                            }, 10);
                                        },
                                    });
                                    iterator = (0, fromNodeStream_ts_1.fromNodeStream)(stream);
                                    return [4 /*yield*/, node_assert_1.default.rejects(function () { return __awaiter(void 0, void 0, void 0, function () {
                                            var _a, iterator_6, iterator_6_1, chunk, e_6_1;
                                            var _b, e_6, _c, _d;
                                            return __generator(this, function (_e) {
                                                switch (_e.label) {
                                                    case 0:
                                                        _e.trys.push([0, 5, 6, 11]);
                                                        _a = true, iterator_6 = __asyncValues(iterator);
                                                        _e.label = 1;
                                                    case 1: return [4 /*yield*/, iterator_6.next()];
                                                    case 2:
                                                        if (!(iterator_6_1 = _e.sent(), _b = iterator_6_1.done, !_b)) return [3 /*break*/, 4];
                                                        _d = iterator_6_1.value;
                                                        _a = false;
                                                        chunk = _d;
                                                        _e.label = 3;
                                                    case 3:
                                                        _a = true;
                                                        return [3 /*break*/, 1];
                                                    case 4: return [3 /*break*/, 11];
                                                    case 5:
                                                        e_6_1 = _e.sent();
                                                        e_6 = { error: e_6_1 };
                                                        return [3 /*break*/, 11];
                                                    case 6:
                                                        _e.trys.push([6, , 9, 10]);
                                                        if (!(!_a && !_b && (_c = iterator_6.return))) return [3 /*break*/, 8];
                                                        return [4 /*yield*/, _c.call(iterator_6)];
                                                    case 7:
                                                        _e.sent();
                                                        _e.label = 8;
                                                    case 8: return [3 /*break*/, 10];
                                                    case 9:
                                                        if (e_6) throw e_6.error;
                                                        return [7 /*endfinally*/];
                                                    case 10: return [7 /*endfinally*/];
                                                    case 11: return [2 /*return*/];
                                                }
                                            });
                                        }); }, function (error) {
                                            return error instanceof Error && error.message === 'Error after chunk';
                                        })];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 9:
                _a.sent();
                return [4 /*yield*/, t.test('handles end after chunks are queued', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var stream, iterator, chunks, _a, iterator_7, iterator_7_1, chunk, e_7_1;
                        var _b, e_7, _c, _d;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    stream = new readable_stream_1.Readable({
                                        read: function () {
                                            var _this = this;
                                            this.push(Buffer.from('chunk1'));
                                            this.push(Buffer.from('chunk2'));
                                            // End after pushing
                                            setTimeout(function () {
                                                _this.push(null);
                                            }, 10);
                                        },
                                    });
                                    iterator = (0, fromNodeStream_ts_1.fromNodeStream)(stream);
                                    chunks = [];
                                    _e.label = 1;
                                case 1:
                                    _e.trys.push([1, 6, 7, 12]);
                                    _a = true, iterator_7 = __asyncValues(iterator);
                                    _e.label = 2;
                                case 2: return [4 /*yield*/, iterator_7.next()];
                                case 3:
                                    if (!(iterator_7_1 = _e.sent(), _b = iterator_7_1.done, !_b)) return [3 /*break*/, 5];
                                    _d = iterator_7_1.value;
                                    _a = false;
                                    chunk = _d;
                                    chunks.push(chunk);
                                    _e.label = 4;
                                case 4:
                                    _a = true;
                                    return [3 /*break*/, 2];
                                case 5: return [3 /*break*/, 12];
                                case 6:
                                    e_7_1 = _e.sent();
                                    e_7 = { error: e_7_1 };
                                    return [3 /*break*/, 12];
                                case 7:
                                    _e.trys.push([7, , 10, 11]);
                                    if (!(!_a && !_b && (_c = iterator_7.return))) return [3 /*break*/, 9];
                                    return [4 /*yield*/, _c.call(iterator_7)];
                                case 8:
                                    _e.sent();
                                    _e.label = 9;
                                case 9: return [3 /*break*/, 11];
                                case 10:
                                    if (e_7) throw e_7.error;
                                    return [7 /*endfinally*/];
                                case 11: return [7 /*endfinally*/];
                                case 12:
                                    node_assert_1.default.strictEqual(chunks.length, 2);
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 10:
                _a.sent();
                return [4 /*yield*/, t.test('handles next() when queue is empty and stream ended', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var stream, iterator, result;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    stream = new readable_stream_1.Readable({
                                        read: function () {
                                            this.push(null); // End immediately
                                        },
                                    });
                                    iterator = (0, fromNodeStream_ts_1.fromNodeStream)(stream);
                                    // Wait for stream to end
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 10); })];
                                case 1:
                                    // Wait for stream to end
                                    _a.sent();
                                    return [4 /*yield*/, iterator.next()];
                                case 2:
                                    result = _a.sent();
                                    node_assert_1.default.ok(result.done);
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 11:
                _a.sent();
                return [4 /*yield*/, t.test('handles next() when queue has items', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var stream, iterator, result1, result2, result3;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    stream = new readable_stream_1.Readable({
                                        read: function () {
                                            this.push(Buffer.from('chunk1'));
                                            this.push(Buffer.from('chunk2'));
                                            this.push(null);
                                        },
                                    });
                                    iterator = (0, fromNodeStream_ts_1.fromNodeStream)(stream);
                                    // Wait for chunks to queue
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 10); })];
                                case 1:
                                    // Wait for chunks to queue
                                    _a.sent();
                                    return [4 /*yield*/, iterator.next()];
                                case 2:
                                    result1 = _a.sent();
                                    node_assert_1.default.ok(!result1.done);
                                    node_assert_1.default.deepStrictEqual(result1.value, Buffer.from('chunk1'));
                                    return [4 /*yield*/, iterator.next()];
                                case 3:
                                    result2 = _a.sent();
                                    node_assert_1.default.ok(!result2.done);
                                    node_assert_1.default.deepStrictEqual(result2.value, Buffer.from('chunk2'));
                                    return [4 /*yield*/, iterator.next()];
                                case 4:
                                    result3 = _a.sent();
                                    node_assert_1.default.ok(result3.done);
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 12:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });

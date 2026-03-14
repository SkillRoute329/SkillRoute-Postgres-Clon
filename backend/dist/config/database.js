"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = exports.db = void 0;
// Re-export database connection from firebase config
var firebase_1 = require("./firebase");
Object.defineProperty(exports, "db", { enumerable: true, get: function () { return firebase_1.db; } });
Object.defineProperty(exports, "auth", { enumerable: true, get: function () { return firebase_1.auth; } });

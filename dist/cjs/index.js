"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdexedSubLevel = void 0;
const abstract_level_1 = require("abstract-level");
const charwise = __importStar(require("charwise-compact"));
class IdexedSubLevel extends abstract_level_1.AbstractSublevel {
    constructor(db, prefix, options) {
        super(db, prefix, {
            keyEncoding: options.keyEncoding,
            valueEncoding: options.valueEncoding,
        });
        this.indexes = {};
        const parseIndexDefinition = (name, def) => {
            if (typeof def === "function") {
                return { getter: def, keyEncoding: charwise };
            }
            if (def && typeof def === "object") {
                return {
                    getter: def.getter || ((record) => record[def.field]),
                    keyEncoding: def.keyEncoding || charwise,
                };
            }
            throw new Error(`Invalid index definition for "${name}". Must be a function or an object.`);
        };
        // Process each index definition.
        for (const [name, def] of Object.entries(options.indexes)) {
            const { getter, keyEncoding } = parseIndexDefinition(name, def);
            const indexName = "idx_" + prefix + "_" + name;
            console.log({ indexName });
            const indexSub = this.db.sublevel(indexName, { keyEncoding });
            this.indexes[name] = { getter, sublevel: indexSub, keyEncoding };
        }
    }
    parseIndexDefinition(def) {
        if (typeof def === "function") {
            return {
                getter: def,
                keyEncoding: charwise,
            };
        }
        if (def && typeof def === "object") {
            return {
                getter: def.getter || ((record) => record[def.field]),
                keyEncoding: def.keyEncoding || charwise,
            };
        }
        throw new Error(`Invalid index definition. Must be a function or an object.`);
    }
    _makeIndexPrefix(name) {
        return "idx" + this.prefix.replace(/!/g, "_") + name;
    }
    /**
     * Insert or update a single record using a chained batch.
     *
     * Creates a chained batch, adds the main sublevel put operation, and for each defined
     * index adds a put using a composite key [indexValue, mainKey]. Then commits the batch atomically.
     *
     * @param key - The primary key for the record.
     * @param value - The record to store.
     */
    async put(key, value) {
        const batch = this.db.batch();
        // Main operation: route the write to the main sublevel.
        batch.put(key, value, { sublevel: this });
        // For each index, compute the index value and add the index update.
        for (const config of Object.values(this.indexes)) {
            const indexValue = config.getter(value);
            if (indexValue !== undefined) {
                const compositeKey = [indexValue, key];
                batch.put(compositeKey, "", { sublevel: config.sublevel });
            }
        }
        await batch.write();
    }
    /**
     * Delete a single record.
     *
     * Retrieves the current record (if it exists) so that its corresponding index entries
     * can be removed. Then deletes the record and its index entries via a chained batch.
     *
     * @param key - The primary key of the record to delete.
     */
    async del(key) {
        const maybeOldValue = await this.get(key);
        if (maybeOldValue === undefined) {
            // Record does not exist; nothing to delete.
            return;
        }
        const oldValue = maybeOldValue;
        const batch = this.db.batch();
        batch.del(key, { sublevel: this });
        for (const config of Object.values(this.indexes)) {
            const indexValue = config.getter(oldValue);
            if (indexValue !== undefined) {
                const compositeKey = [indexValue, key];
                batch.del(compositeKey, { sublevel: config.sublevel });
            }
        }
        await batch.write();
    }
    /**
     * Query an index for all records matching a given index value.
     *
     * Performs a range query on the index sublevel using composite keys, collects all primary keys,
     * and then uses getMany() on the main sublevel for efficient bulk retrieval.
     *
     * @param indexName - The name of the index to query.
     * @param value - The index value to search for.
     * @returns An array of matching records.
     */
    async query(indexName, value) {
        const config = this.indexes[indexName];
        if (!config) {
            throw new Error(`Index "${indexName}" not defined`);
        }
        // Use '\uffff' as a high-value constant for the upper bound.
        const lowerBound = [value];
        const upperBound = [value, "\uffff"];
        const keys = [];
        for await (const [compositeKey] of config.sublevel.iterator({
            gt: lowerBound,
            lt: upperBound,
        })) {
            // The composite key is [indexValue, mainKey].
            keys.push(compositeKey[1]);
        }
        if (keys.length === 0)
            return [];
        const records = await this.getMany(keys);
        return records.filter((record) => record !== undefined);
    }
}
exports.IdexedSubLevel = IdexedSubLevel;

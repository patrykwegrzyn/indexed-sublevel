import {
  AbstractLevel,
  AbstractSublevel,
  AbstractSublevelOptions,
  AbstractChainedBatch,
} from "abstract-level";

import * as charwise from "charwise-compact";

export type IndexDef<V> =
  | ((record: V) => any)
  | {
      getter?: (record: V) => any;
      field?: keyof V;
      keyEncoding?: string | any;
    };

export type AbstractSublevelOptionsIndexed<K, V> = AbstractSublevelOptions<
  K,
  V
> & {
  indexes: Record<string, IndexDef<V>>;
};
export class IdexedSubLevel<K = any, V = any> extends AbstractSublevel<
  any,
  any,
  K,
  V
> {
  indexes: Record<
    string,
    {
      getter: (record: V) => any;
      sublevel: AbstractSublevel<any, any, any, any>;
      keyEncoding: string | any;
    }
  > = {};

  constructor(
    db: AbstractLevel<any, any, any>,
    prefix: string,
    options: AbstractSublevelOptionsIndexed<K, V>
  ) {
    super(db, prefix, {
      keyEncoding: options.keyEncoding,
      valueEncoding: options.valueEncoding,
    });

    const parseIndexDefinition = (
      name: string,
      def: IndexDef<V>
    ): { getter: (record: V) => any; keyEncoding: string | any } => {
      if (typeof def === "function") {
        return { getter: def, keyEncoding: charwise };
      }
      if (def && typeof def === "object") {
        return {
          getter: def.getter || ((record: V) => record[def.field as keyof V]),
          keyEncoding: def.keyEncoding || charwise,
        };
      }
      throw new Error(
        `Invalid index definition for "${name}". Must be a function or an object.`
      );
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

  private parseIndexDefinition(def: IndexDef<V>) {
    if (typeof def === "function") {
      return {
        getter: def,
        keyEncoding: charwise,
      };
    }
    if (def && typeof def === "object") {
      return {
        getter: def.getter || ((record: V) => record[def.field as keyof V]),
        keyEncoding: def.keyEncoding || charwise,
      };
    }
    throw new Error(
      `Invalid index definition. Must be a function or an object.`
    );
  }

  _makeIndexPrefix(name: string) {
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
  async put(key: K, value: V): Promise<void> {
    const batch = this.db.batch() as AbstractChainedBatch<any, K, V>;

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
  async del(key: K): Promise<void> {
    const maybeOldValue = await this.get(key);
    if (maybeOldValue === undefined) {
      // Record does not exist; nothing to delete.
      return;
    }
    const oldValue: V = maybeOldValue;

    const batch = this.db.batch() as AbstractChainedBatch<any, K, V>;
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
  async query(indexName: string, value: any): Promise<V[]> {
    const config = this.indexes[indexName];
    if (!config) {
      throw new Error(`Index "${indexName}" not defined`);
    }

    // Use '\uffff' as a high-value constant for the upper bound.
    const lowerBound = [value];
    const upperBound = [value, "\uffff"];
    const keys: K[] = [];

    for await (const [compositeKey] of config.sublevel.iterator({
      gt: lowerBound,
      lt: upperBound,
    })) {
      // The composite key is [indexValue, mainKey].
      keys.push(compositeKey[1]);
    }
    if (keys.length === 0) return [];

    const records = await this.getMany(keys);
    return records.filter((record): record is V => record !== undefined);
  }
}

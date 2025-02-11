import { AbstractLevel, AbstractSublevel, AbstractSublevelOptions } from "abstract-level";
export type IndexDef<V> = ((record: V) => any) | {
    getter?: (record: V) => any;
    field?: keyof V;
    keyEncoding?: string | any;
};
export type AbstractSublevelOptionsIndexed<K, V> = AbstractSublevelOptions<K, V> & {
    indexes: Record<string, IndexDef<V>>;
};
export declare class IdexedSubLevel<K = any, V = any> extends AbstractSublevel<any, any, K, V> {
    indexes: Record<string, {
        getter: (record: V) => any;
        sublevel: AbstractSublevel<any, any, any, any>;
        keyEncoding: string | any;
    }>;
    constructor(db: AbstractLevel<any, any, any>, prefix: string, options: AbstractSublevelOptionsIndexed<K, V>);
    private parseIndexDefinition;
    _makeIndexPrefix(name: string): string;
    /**
     * Insert or update a single record using a chained batch.
     *
     * Creates a chained batch, adds the main sublevel put operation, and for each defined
     * index adds a put using a composite key [indexValue, mainKey]. Then commits the batch atomically.
     *
     * @param key - The primary key for the record.
     * @param value - The record to store.
     */
    put(key: K, value: V): Promise<void>;
    /**
     * Delete a single record.
     *
     * Retrieves the current record (if it exists) so that its corresponding index entries
     * can be removed. Then deletes the record and its index entries via a chained batch.
     *
     * @param key - The primary key of the record to delete.
     */
    del(key: K): Promise<void>;
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
    query(indexName: string, value: any): Promise<V[]>;
}

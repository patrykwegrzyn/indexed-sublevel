declare module "@nxtedition/rocksdb" {
  import { AbstractDatabaseOptions, AbstractLevel } from "abstract-level";

  export declare class RocksLevel extends AbstractLevel {
    constructor(
      manifest: Partial<IManifest>,
      options?: AbstractDatabaseOptions<KDefault, VDefault> | undefined
    );
    // supports: IManifest;
    // sublevel(
    //   name: string | string[]
    // ): AbstractSublevel<typeof this, TFormat, K, V>;
    // sublevel<K = string, V = string>(
    //   name: string | string[],
    //   options: AbstractSublevelOptions<K, V>
    // );
    // keys(): AbstractKeyIterator<typeof this, KDefault>;
    // keys<K = KDefault>(
    //   options: AbstractKeyIteratorOptions<K>
    // ): AbstractKeyIterator<typeof this, K>;
  }
}

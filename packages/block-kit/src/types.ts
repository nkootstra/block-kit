/** A block or element as it appears in the JSON. Components narrow it to the fields they read. */
export interface Json {
  type: string;
  [field: string]: unknown;
}

export interface BlockProps<T = Json> {
  block: T;
  /** The block's `block_id`, or the one generated for it. */
  blockId: string;
  index: number;
}

export interface ElementProps<T = Json> {
  element: T;
  blockId: string;
}

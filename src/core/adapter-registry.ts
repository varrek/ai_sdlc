import type { HostId } from "../schema/index.js";
import type { Adapter } from "./types.js";

/** Maps host ids to their adapters; the engine dispatches only to registered hosts. */
export class AdapterRegistry {
  private readonly adapters = new Map<HostId, Adapter>();

  register(adapter: Adapter): this {
    this.adapters.set(adapter.host, adapter);
    return this;
  }

  get(host: HostId): Adapter | undefined {
    return this.adapters.get(host);
  }

  has(host: HostId): boolean {
    return this.adapters.has(host);
  }

  /** All registered adapters (insertion order). */
  all(): Adapter[] {
    return [...this.adapters.values()];
  }
}

import type { Batch, Crate } from "../../../shared/contracts";
import { items } from "../../../shared/catalog";
export function makeBatch(
  item: Batch["item"],
  quantity: number,
  quality: number,
  hour: number,
  id: string,
  source = "收获",
): Batch {
  return {
    id,
    item,
    quantity,
    quality,
    source,
    expires: hour + items[item].life,
  };
}
export function makeCrate(
  id: string,
  capacity: number,
  contents: Batch[] = [],
  broken = false,
  trips = 0,
): Crate {
  return { id, capacity, contents, broken, trips };
}
export function crateLoad(crate: Readonly<Crate>) {
  return crate.contents.reduce((n, b) => n + b.quantity, 0);
}
export function crateFree(crate: Readonly<Crate>) {
  return crate.broken ? 0 : crate.capacity - crateLoad(crate);
}
export function summarize(batches: readonly Readonly<Batch>[]) {
  return batches.reduce((n, b) => n + b.quantity, 0);
}
/** 拆箱时保留每一批自己的品质与保质期，不重算寿命。 */
export function unloadCrate(crate: Crate): Batch[] {
  return crate.contents.map((b) => ({ ...b }));
}

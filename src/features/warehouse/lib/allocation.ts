import type {
  Batch,
  Crate,
  Reservation,
  Item,
  Allocation,
} from "../../../shared/contracts";

/** 散装批次 + 箱内批次，构成真实的全部库存。 */
export function allBatches(
  batches: readonly Batch[],
  crates: readonly Crate[],
): Batch[] {
  return [...batches, ...crates.flatMap((c) => c.contents)];
}

export function crateOfBatch(
  crates: readonly Crate[],
  batchId: string,
): Crate | undefined {
  return crates.find((c) => c.contents.some((b) => b.id === batchId));
}

/** 被整箱订单锁定的箱子，箱内份额整体不可再分。 */
export function lockedCrateIds(
  reservations: readonly Reservation[],
): Set<string> {
  return new Set(
    reservations.flatMap((r) => (r.crates ? [...r.crates] : [])),
  );
}

export function allocatedQuantity(batchId: string, reservations: Reservation[]) {
  return reservations
    .flatMap((r) => r.allocations)
    .filter((a) => a.batch === batchId)
    .reduce((n, a) => n + a.quantity, 0);
}

export function available(
  batch: Batch,
  reservations: Reservation[],
  crates: readonly Crate[] = [],
) {
  const crate = crateOfBatch(crates, batch.id);
  if (crate && lockedCrateIds(reservations).has(crate.id)) return 0;
  return Math.max(0, batch.quantity - allocatedQuantity(batch.id, reservations));
}

export function allocate(
  batches: readonly Batch[],
  crates: readonly Crate[],
  reservations: Reservation[],
  item: Item,
  quantity: number,
  hour: number,
  minQuality = 1,
): Allocation[] | null {
  let remaining = quantity;
  const result: Allocation[] = [];
  const locked = lockedCrateIds(reservations);
  for (const batch of allBatches(batches, crates)
    .filter(
      (b) => b.item === item && b.expires > hour && b.quality >= minQuality,
    )
    .filter((b) => {
      const crate = crateOfBatch(crates, b.id);
      return !crate || !locked.has(crate.id);
    })
    .sort((a, b) => a.expires - b.expires)) {
    const n = Math.min(remaining, available(batch, reservations, crates));
    if (n > 0) {
      result.push({ batch: batch.id, quantity: n });
      remaining -= n;
    }
    if (!remaining) return result;
  }
  return null;
}

/**
 * 整箱配货：按订单指定容量挑选若干只装满、完好的箱子。
 * 箱内可以混批，但必须全是同一商品且达到品质要求。
 */
export function allocateCrates(
  crates: readonly Crate[],
  reservations: Reservation[],
  item: Item,
  quantity: number,
  hour: number,
  minQuality: number,
  capacity: number,
): string[] | null {
  if (capacity <= 0 || quantity <= 0 || quantity % capacity) return null;
  const count = quantity / capacity;
  const locked = lockedCrateIds(reservations);
  const candidates = crates
    .filter((c) => {
      if (c.broken || c.capacity !== capacity || locked.has(c.id)) return false;
      const load = c.contents.reduce((n, b) => n + b.quantity, 0);
      return (
        load === c.capacity &&
        c.contents.length > 0 &&
        c.contents.every(
          (b) => b.item === item && b.quality >= minQuality && b.expires > hour,
        ) &&
        c.contents.every(
          (b) => allocatedQuantity(b.id, reservations) === 0,
        )
      );
    })
    .sort(
      (a, b) =>
        Math.min(...a.contents.map((x) => x.expires)) -
        Math.min(...b.contents.map((x) => x.expires)),
    );
  if (candidates.length < count) return null;
  return candidates.slice(0, count).map((c) => c.id);
}

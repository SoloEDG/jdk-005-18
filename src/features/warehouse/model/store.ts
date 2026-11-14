import { reactive, readonly } from "vue";
import type {
  Item,
  Batch,
  Crate,
  Reservation,
  Notice,
  Receipt,
  Order,
} from "../../../shared/contracts";
import {
  allocate,
  allocateCrates,
  allBatches,
  available,
  crateOfBatch,
} from "../lib/allocation";
import { makeBatch, makeCrate, crateLoad, crateFree } from "../lib/storage";
/** 一只周转箱可以经历多少次出入库后自然损坏。 */
const CRATE_TRIPS = 12;
export function createWarehouse(now: () => number, notice: Notice) {
  const state = reactive({
    batches: [] as Batch[],
    crates: [] as Crate[],
    reservations: [] as Reservation[],
    serial: 0,
    wasted: 0,
    /** 周转统计：累计制作、回收、空闲箱数。 */
    built: 0,
    returned: 0,
  });
  const add = (
    item: Item,
    n: number,
    q = 1,
    hour = now(),
    source = "田间收获",
  ) => {
    state.batches.push(
      makeBatch(item, n, q, hour, `b${++state.serial}`, source),
    );
  };
  add("carrot", 8, 2);
  add("berry", 6, 2);
  add("corn", 8, 1);

  const batchById = (id: string) =>
    allBatches(state.batches, state.crates).find((b) => b.id === id);
  const crateLocks = (crateId: string) =>
    state.reservations.some((r) => r.crates?.includes(crateId));
  const takeFromBatch = (batchId: string, n: number) => {
    const crate = crateOfBatch(state.crates, batchId);
    const pool = crate?.contents ?? state.batches;
    const b = pool.find((x) => x.id === batchId);
    if (!b || b.quantity < n) return false;
    b.quantity -= n;
    if (!b.quantity) {
      if (crate) crate.contents = crate.contents.filter((x) => x !== b);
      else state.batches = state.batches.filter((x) => x !== b);
    }
    return true;
  };
  const receiptFor = (r: Reservation): Receipt | null => {
    if (!r.allocations.length) return null;
    const found = r.allocations.map((a) => batchById(a.batch));
    if (
      found.some((b) => !b || b.expires <= now()) ||
      r.allocations.some(
        (a) => (batchById(a.batch)?.quantity ?? 0) < a.quantity,
      )
    )
      return null;
    return {
      quality: Math.min(...found.map((b) => b!.quality)),
      sources: found.map((b) => b!.source),
      quantity: r.allocations.reduce((n, a) => n + a.quantity, 0),
    };
  };
  const crateReceiptFor = (r: Reservation): Receipt | null => {
    const receipts: Receipt[] = [];
    for (const crateId of r.crates ?? []) {
      const crate = state.crates.find((c) => c.id === crateId);
      if (!crate || crate.broken || !crate.contents.length) return null;
      if (crate.contents.some((b) => b.expires <= now())) return null;
      if (crateLoad(crate) !== crate.capacity) return null;
      receipts.push({
        quality: Math.min(...crate.contents.map((b) => b.quality)),
        sources: crate.contents.map((b) => b.source),
        quantity: crate.capacity,
      });
    }
    return {
      quality: Math.min(...receipts.map((x) => x.quality)),
      sources: receipts.flatMap((x) => [...x.sources]),
      quantity: receipts.reduce((n, x) => n + x.quantity, 0),
    };
  };
  /**
   * 结算预留。整箱随货离开仓库；订单约定返还的空箱保留原箱身份回到仓里，
   * 客户留下的箱子则从库存移除。
   */
  const consumeReservation = (
    r: Reservation,
    returnCrates = 0,
  ): Receipt | null => {
    const crateReceipt = r.crates?.length ? crateReceiptFor(r) : null;
    if (r.crates?.length && !crateReceipt) return null;
    const looseReceipt = receiptFor(r);
    if (r.allocations.length && !looseReceipt) return null;
    // 只有随订单离开的箱子才能按约定退回，返还数不超过实际交付箱数。
    const returnCount = Math.min(Math.max(0, returnCrates), r.crates?.length ?? 0);
    if (returnCrates > returnCount)
      notice(`订单约定返还 ${returnCrates} 只空箱，实际只交付了 ${returnCount} 只`);
    const returnedIds = new Set((r.crates ?? []).slice(0, returnCount));
    for (const crateId of r.crates ?? []) {
      const crate = state.crates.find((c) => c.id === crateId)!;
      crate.contents = [];
      crate.trips++;
      if (returnedIds.has(crateId)) {
        state.returned++;
        if (crate.trips >= CRATE_TRIPS) {
          crate.broken = true;
          notice(`${crate.id} 回收时已损坏，需要修复`);
        }
      } else {
        state.crates = state.crates.filter((c) => c.id !== crateId);
      }
    }
    for (const a of r.allocations) takeFromBatch(a.batch, a.quantity);
    const parts = [...(crateReceipt ? [crateReceipt] : []), ...(looseReceipt ? [looseReceipt] : [])];
    return {
      quality: Math.min(...parts.map((x) => x.quality)),
      sources: parts.flatMap((x) => [...x.sources]),
      quantity: parts.reduce((n, x) => n + x.quantity, 0),
    };
  };
  const canConsume = (r: Reservation) =>
    (r.crates?.length ? !!crateReceiptFor(r) : true) &&
    (!r.allocations.length || !!receiptFor(r));

  return {
    state: readonly(state),
    add,
    /** 工坊领货：有合适空位就直接装进一只可用箱，否则保留散装。 */
    addPacked(
      item: Item,
      n: number,
      q = 1,
      hour = now(),
      source = "工坊成品",
    ) {
      if (n <= 0) return false;
      const target = state.crates
        .filter(
          (c) =>
            !c.broken &&
            crateFree(c) >= n &&
            !crateLocks(c.id) &&
            (!c.contents.length || c.contents[0]!.item === item),
        )
        .sort((a, b) => a.capacity - b.capacity)[0];
      if (!target) return false;
      target.contents.push(
        makeBatch(item, n, q, hour, `b${++state.serial}`, source),
      );
      return true;
    },
    makeCrate(capacity: number) {
      state.crates.push(makeCrate(`c${++state.serial}`, capacity));
      state.built++;
    },
    /** 将散装批次装进一只带身份与容量的箱子；品质、保质原样保留。 */
    pack(crateId: string, batchId: string, n: number) {
      const crate = state.crates.find((c) => c.id === crateId);
      const b = state.batches.find((b) => b.id === batchId);
      if (!crate || !b || crate.broken || !Number.isInteger(n) || n < 1)
        return false;
      if (crateLocks(crateId)) return false;
      if (b.expires <= now()) return false;
      if (n > crateFree(crate)) return false;
      // 一只箱子只装同一商品，箱内允许多个品质批次混装。
      if (crate.contents.some((x) => x.item !== b.item)) return false;
      if (n > available(b, state.reservations, state.crates)) return false;
      b.quantity -= n;
      // 箱内份额继承同一品质/来源/到期时刻；部分装箱时另给批次号，
      // 避免同一批次在散装区和箱内被重复引用。
      crate.contents.push(
        b.quantity
          ? { ...b, id: `b${++state.serial}`, quantity: n }
          : { ...b, quantity: n },
      );
      if (!b.quantity)
        state.batches = state.batches.filter((x) => x.id !== batchId);
      return true;
    },
    /** 拆箱：各批次带着自己的品质与保质期回到散装区，箱子变空可周转。 */
    unpack(crateId: string) {
      const crate = state.crates.find((c) => c.id === crateId);
      if (!crate || crate.broken || !crate.contents.length) return false;
      if (crateLocks(crateId)) return false;
      // 箱内有过期食品时不能整箱倒回散装区，只能走“拆完好份额”。
      if (crate.contents.some((b) => b.expires <= now())) return false;
      if (
        crate.contents.some((b) =>
          state.reservations.some((r) =>
            r.allocations.some((a) => a.batch === b.id),
          ),
        )
      )
        return false;
      state.batches.push(...crate.contents.map((b) => ({ ...b })));
      crate.contents = [];
      // 箱子如实周转：用得太久会自然损坏，需要修复后才能再用。
      crate.trips++;
      if (crate.trips >= CRATE_TRIPS) {
        crate.broken = true;
        notice(`${crate.id} 在周转中损坏，需要修复`);
      }
      return true;
    },
    /** 坏箱或过期食品：只拆出尚完好的份额，坏的计入损耗。 */
    salvage(crateId: string) {
      const crate = state.crates.find((c) => c.id === crateId);
      if (!crate) return 0;
      if (crateLocks(crateId)) return 0;
      if (
        crate.contents.some((b) =>
          state.reservations.some((r) =>
            r.allocations.some((a) => a.batch === b.id),
          ),
        )
      )
        return 0;
      const hour = now();
      const keep = crate.contents.filter((b) => b.expires > hour && b.quantity);
      const spoiled = crate.contents.filter((b) => b.expires <= hour);
      state.wasted += spoiled.reduce((n, b) => n + b.quantity, 0);
      crate.contents = [];
      crate.trips++;
      // 装过变质食品的箱子受到污染，必须修复后才能重新周转。
      if (spoiled.length) crate.broken = true;
      state.batches.push(...keep.map((b) => ({ ...b })));
      return keep.reduce((n, b) => n + b.quantity, 0);
    },
    repair(crateId: string) {
      const crate = state.crates.find((c) => c.id === crateId);
      if (!crate || !crate.broken || crate.contents.length) return false;
      crate.broken = false;
      crate.trips = 0;
      return true;
    },
    free: (id: string) => {
      const b = batchById(id);
      return b ? available(b, state.reservations, state.crates) : 0;
    },
    reserve(owner: string, item: Item, n: number, minQuality = 1) {
      const allocations = allocate(
        state.batches,
        state.crates,
        state.reservations,
        item,
        n,
        now(),
        minQuality,
      );
      if (!allocations) return null;
      const id = `r${++state.serial}`;
      state.reservations.push({ id, owner, allocations });
      return id;
    },
    /** 订单配货：整箱订单只接受装满的完整箱子，绝不退化成散装交付。 */
    reserveOrder(o: Order) {
      const owner = `order:${o.id}`;
      if (o.crate) {
        if (!Number.isInteger(o.quantity / o.crate.capacity)) return null;
        const crates = allocateCrates(
          state.crates,
          state.reservations,
          o.item,
          o.quantity,
          now(),
          o.minQuality,
          o.crate.capacity,
        );
        if (!crates) return null;
        const id = `r${++state.serial}`;
        // 箱内货物随箱锁定，不另占散装份额。
        state.reservations.push({
          id,
          owner,
          allocations: [],
          crates,
        });
        return { id, boxed: true as const };
      }
      const allocations = allocate(
        state.batches,
        state.crates,
        state.reservations,
        o.item,
        o.quantity,
        now(),
        o.minQuality,
      );
      if (!allocations) return null;
      const id = `r${++state.serial}`;
      state.reservations.push({ id, owner, allocations });
      return { id, boxed: false as const };
    },
    consume(id: string, returnCrates = 0) {
      const r = state.reservations.find((r) => r.id === id);
      if (!r) return null;
      const receipt = consumeReservation(r, returnCrates);
      if (!receipt) return null;
      state.reservations = state.reservations.filter((x) => x.id !== id);
      return receipt;
    },
    /** 多份原料（木材 + 纤维）要么全部结算，要么一份都不扣。 */
    consumeMany(ids: string[]): Receipt | null {
      const found = ids.map((id) =>
        state.reservations.find((r) => r.id === id),
      );
      if (found.some((r) => !r)) return null;
      if (found.some((r) => !canConsume(r!))) return null;
      const receipts = found.map((r) => consumeReservation(r!));
      if (receipts.some((x) => !x)) return null;
      state.reservations = state.reservations.filter(
        (r) => !ids.includes(r.id),
      );
      return {
        quality: Math.min(...receipts.map((x) => x!.quality)),
        sources: receipts.flatMap((x) => [...x!.sources]),
        quantity: receipts.reduce((n, x) => n + x!.quantity, 0),
      };
    },
    release: (id: string) => {
      state.reservations = state.reservations.filter((r) => r.id !== id);
    },
    sell(id: string, n: number) {
      const b = batchById(id);
      if (!b || b.expires <= now()) return null;
      if (available(b, state.reservations, state.crates) < n) return null;
      if (!takeFromBatch(id, n)) return null;
      return b.item;
    },
    tick(hour: number) {
      const expiredLoose = state.batches.filter((b) => b.expires <= hour);
      const freshLoose = expiredLoose.filter((b) => b.expires > hour - 1);
      state.wasted += expiredLoose.reduce((n, b) => n + b.quantity, 0);
      state.batches = state.batches.filter((b) => b.expires > hour);
      // 箱内过期批次留在箱中：拆箱/清箱时只取完好份额。
      // 只播报本小时内新到期的批次，避免每小时重复提示。
      const justExpired = (b: Batch) => b.expires <= hour && b.expires > hour - 1;
      const expiredInCrates = state.crates.flatMap((c) =>
        c.contents.filter((b) => justExpired(b) && !crateLocks(c.id)),
      );
      const stale = [...expiredLoose, ...expiredInCrates];
      if (stale.length)
        state.reservations = state.reservations.filter(
          (r) => !r.allocations.some((a) => stale.some((b) => b.id === a.batch)),
        );
      if (freshLoose.length)
        notice(`${freshLoose.length} 批散装库存已到保质期`);
      if (expiredInCrates.length)
        notice(`${expiredInCrates.length} 批箱内食品过期，只能拆出完好份额`);
    },
    /** 工坊领货是否有可用箱子（用于工坊提示与测试）。 */
    canPackInto: (item: Item, n: number) =>
      state.crates.some(
        (c) =>
          !c.broken &&
          !crateLocks(c.id) &&
          crateFree(c) >= n &&
          (!c.contents.length || c.contents[0]!.item === item),
      ),
    stats: () => ({
      built: state.built,
      returned: state.returned,
      empty: state.crates.filter((c) => !c.broken && !c.contents.length).length,
      total: state.crates.length,
    }),
    snapshot: () => JSON.parse(JSON.stringify(state)) as typeof state,
    /** 本机存档升级：旧存档没有箱子字段，原有商品自然保持散装。 */
    restore: (data: Partial<typeof state>) => {
      Object.assign(state, {
        batches: [],
        crates: [],
        reservations: [],
        serial: 0,
        wasted: 0,
        built: 0,
        returned: 0,
        ...data,
      });
    },
  };
}

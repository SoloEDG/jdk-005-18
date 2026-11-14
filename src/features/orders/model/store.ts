import { reactive, readonly } from "vue";
import type { Order, Notice, Receipt } from "../../../shared/contracts";
import { crateKindFor } from "../../../shared/crates";
import { initialOrders, nextOrder } from "../lib/offers";
interface Ports {
  reserveOrder: (order: Order) => { id: string; boxed: boolean } | null;
  /** returnCrates 为签收后按约定返还的空箱数（保留原箱身份）。 */
  consume: (id: string, returnCrates?: number) => Receipt | null;
  release: (id: string) => void;
}
export function createOrders(ports: Ports, notice: Notice, hour: number) {
  const state = reactive({
    coins: 180,
    xp: 0,
    delivered: 0,
    serial: 4,
    orders: initialOrders(hour),
  });
  const spend = (n: number) => {
    if (n < 0 || state.coins < n) return false;
    state.coins -= n;
    return true;
  };
  return {
    state: readonly(state),
    spend,
    earn: (n: number) => {
      state.coins += n;
    },
    reserve(id: string) {
      const o = state.orders.find((o) => o.id === id);
      if (!o || o.status !== "open") return;
      const reserved = ports.reserveOrder(o);
      if (!reserved) {
        notice(
          o.crate
            ? `整箱订单需要 ${Math.ceil(o.quantity / o.crate.capacity)} 只装满的箱子：先把同类货物装箱`
            : "可用库存不足，先收获或加工",
        );
        return;
      }
      o.reservation = reserved.id;
      o.status = "reserved";
      notice(
        reserved.boxed
          ? "订单已按整箱备货，箱子随货锁定"
          : "订单已备货，库存已占用",
      );
    },
    deliver(id: string, hour: number) {
      const o = state.orders.find((o) => o.id === id);
      if (!o || o.status !== "reserved" || !o.reservation) return;
      const receipt = ports.consume(o.reservation, o.crate?.empties ?? 0);
      if (!receipt) {
        // 整箱/批次已经不可交付时，锁定全部释放，绝不把原整箱再交一次。
        ports.release(o.reservation);
        o.status = "open";
        delete o.reservation;
        notice("货物已失效，无法交付");
        return;
      }
      o.status = "delivered";
      state.coins += o.reward;
      const xp = 40 + (receipt.quality > 1 ? 10 : 0);
      state.xp += xp;
      state.delivered++;
      // 整箱交付时，约定数量的空箱已随结算保留在仓库里继续周转。
      if (o.crate && o.crate.empties > 0) {
        notice(
          `交付成功，收入 ¥${o.reward}；客户返还 ${o.crate.empties} 只${crateKindFor(o.crate.capacity).name}`,
        );
      } else {
        notice(`交付成功，收入 ¥${o.reward} / +${xp} 经验`);
      }
      state.orders.push(nextOrder(++state.serial, hour));
    },
    cancel(id: string) {
      const o = state.orders.find((o) => o.id === id);
      if (o?.status === "reserved" && o.reservation) {
        ports.release(o.reservation);
        o.status = "open";
        delete o.reservation;
      }
    },
    tick(hour: number) {
      for (const o of state.orders)
        if (
          (o.status === "open" || o.status === "reserved") &&
          o.deadline <= hour
        ) {
          if (o.reservation) ports.release(o.reservation);
          o.status = "expired";
        }
    },
    snapshot: () => JSON.parse(JSON.stringify(state)) as typeof state,
    restore: (data: Partial<typeof state>) => {
      Object.assign(state, { orders: [], serial: 0, ...data });
    },
  };
}

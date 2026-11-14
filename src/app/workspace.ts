import { ref } from "vue";
import { createClock, createEngine } from "../features/clock";
import { createFields } from "../features/fields";
import { createWarehouse } from "../features/warehouse";
import { createWorkshop } from "../features/workshop";
import { createOrders, salePrice } from "../features/orders";
import { items } from "../shared/catalog";
import { saveFarm, loadFarm } from "./persistence";
export function createWorkspace() {
  const notices = ref<string[]>(["欢迎回到青禾农场。先备一份胡萝卜订单吧。"]);
  const notice = (message: string) => {
    notices.value = [message, ...notices.value].slice(0, 12);
  };
  const clock = createClock();
  const warehouse = createWarehouse(() => clock.state.hour, notice);
  const orders = createOrders(warehouse, notice, clock.state.hour);
  const fields = createFields(orders.spend, warehouse.add, notice);
  const workshop = createWorkshop(
    {
      ...warehouse,
      addPacked: warehouse.addPacked,
      consumeMany: warehouse.consumeMany,
      spend: orders.spend,
    },
    notice,
  );
  const engine = createEngine(
    () => clock.state.hour,
    clock.setHour,
    (t) => {
      warehouse.tick(t.to);
      fields.tick(t);
      workshop.tick(t.to);
      orders.tick(t.to);
    },
  );
  const snapshot = () => ({
    clock: clock.snapshot(),
    warehouse: warehouse.snapshot(),
    fields: fields.snapshot(),
    workshop: workshop.snapshot(),
    orders: orders.snapshot(),
  });
  return {
    clock,
    warehouse,
    fields,
    workshop,
    orders,
    engine,
    notices,
    pack(crateId: string, batchId: string, n: number | "fill") {
      const crate = warehouse.state.crates.find((c) => c.id === crateId);
      const batch = warehouse.state.batches.find((b) => b.id === batchId);
      if (!crate || !batch) return;
      const load = crate.contents.reduce((sum, b) => sum + b.quantity, 0);
      const amount =
        n === "fill"
          ? Math.min(crate.capacity - load, warehouse.free(batchId))
          : n;
      if (amount < 1) {
        notice("这只箱子没有空位");
        return;
      }
      if (warehouse.pack(crateId, batchId, amount))
        notice(`已装箱 ${amount} 份，品质与保质随批保留`);
      else notice("装箱失败：箱子损坏或份额已被占用");
    },
    unpack(crateId: string) {
      if (warehouse.unpack(crateId)) notice("已拆箱，批次回到散装区");
      else notice("这只箱子被订单锁定、已损坏或箱内有变质食品，只能拆完好份额");
    },
    salvage(crateId: string) {
      const kept = warehouse.salvage(crateId);
      notice(
        kept
          ? `已拆出完好份额 ${kept} 份，变质部分计入损耗`
          : "箱内没有可拆出的完好份额",
      );
    },
    repair(crateId: string) {
      if (warehouse.repair(crateId)) notice("坏箱已修复，可以继续周转");
      else notice("只有清空的坏箱才能修复");
    },
    sell(id: string) {
      const item = warehouse.sell(id, 1);
      if (item) {
        orders.earn(salePrice(items[item].value));
        notice(`出售${items[item].name} 1 份`);
      }
    },
    save() {
      try {
        saveFarm(snapshot());
        notice("已保存到本机");
      } catch {
        notice("保存失败，本机空间不足");
      }
    },
    load() {
      try {
        const data = loadFarm<ReturnType<typeof snapshot>>();
        if (!data) {
          notice("还没有本机存档");
          return;
        }
        clock.restore(data.clock);
        warehouse.restore(data.warehouse);
        fields.restore(data.fields);
        workshop.restore(data.workshop);
        orders.restore(data.orders);
        notice("已恢复保存时刻");
      } catch {
        notice("存档损坏，无法恢复");
      }
    },
  };
}

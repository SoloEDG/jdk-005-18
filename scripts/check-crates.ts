/**
 * 周转箱守恒回归脚本。通过 esbuild 打包后以 Node 运行，不进入应用构建。
 */
import { createWarehouse } from "../src/features/warehouse/model/store";
import { createWorkshop } from "../src/features/workshop/model/store";
import { createOrders } from "../src/features/orders/model/store";
import { crateLoad } from "../src/features/warehouse/lib/storage";
import type { Order } from "../src/shared/contracts";
import { crateRecipes } from "../src/features/workshop/lib/recipes";

const notes: string[] = [];
const notice = (m: string) => notes.push(m);
let hour = 6;
const w = createWarehouse(() => hour, notice);
const orders = createOrders(w as never, notice, hour);
const ws = createWorkshop(
  { ...w, spend: orders.spend, consumeMany: w.consumeMany } as never,
  notice,
);
let failed = 0;
const assert = (label: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};
const totals = () => {
  const s = w.state;
  return {
    loose: s.batches.reduce((n, b) => n + b.quantity, 0),
    inCrates: s.crates.reduce((n, c) => n + crateLoad(c), 0),
    reserved: s.reservations
      .flatMap((r) => r.allocations)
      .reduce((n, a) => n + a.quantity, 0),
    crates: s.crates.length,
    empty: s.crates.filter((c) => !c.contents.length && !c.broken).length,
  };
};
const invariants = (label: string) => {
  const s = w.state;
  const ids = [
    ...s.batches,
    ...s.crates.flatMap((c) => c.contents),
  ].map((b) => b.id);
  assert(`${label}：批次号唯一`, new Set(ids).size === ids.length);
  assert(
    `${label}：箱子不超容量`,
    !s.crates.some((c) => crateLoad(c) > c.capacity),
  );
  assert(
    `${label}：无异类混装`,
    !s.crates.some((c) =>
      c.contents.some((b) => b.item !== c.contents[0]?.item),
    ),
  );
};

// 1. 原料作物 → 工坊木箱 → 空箱入仓
w.add("wood", 10, 1, hour, "播种木材");
w.add("fiber", 6, 1, hour, "播种纤维");
ws.enqueue(crateRecipes.find((r) => r.capacity === 4)!.id, hour);
hour += 2;
ws.tick(hour);
assert("木箱加工完成", ws.state.jobs[0]!.status === "ready");
ws.claim("j1", hour);
invariants("空箱入仓");
assert("木材纤维真实扣除", w.state.batches.find((b) => b.item === "wood")!.quantity === 8);
assert("空箱进入仓库", totals().empty === 1);

// 2. 装箱占用真实份额与容器，品质与保质不变
const crate = w.state.crates[0]!;
const carrot = w.state.batches.find((b) => b.item === "carrot")!;
const expires = carrot.expires;
assert("装箱成功", w.pack(crate.id, carrot.id, 4));
invariants("装箱后");
assert(
  "装箱不改保质期",
  w.state.crates[0]!.contents.every((b) => b.expires === expires),
);
assert("箱满后不能多装", w.pack(crate.id, carrot.id, 1) === false);

// 3. 整箱订单：装满两只箱子才可备货
assert(
  "只有一只满箱时拒绝整箱备货",
  orders.reserve("o4") === undefined &&
    orders.state.orders.find((o) => o.id === "o4")!.status === "open",
);
w.makeCrate(4);
const crate2 = w.state.crates.find((c) => !c.contents.length)!;
const carrot2 = w.state.batches.find((b) => b.item === "carrot")!;
w.pack(crate2.id, carrot2.id, 4);
orders.reserve("o4");
assert("两只满箱后整箱备货", orders.state.orders.find((o) => o.id === "o4")!.status === "reserved");
const before = orders.state.coins;
orders.deliver("o4", hour);
assert("整箱交付结算奖励", orders.state.coins === before + 150);
assert(
  "客户返还约定数量空箱并保留箱号",
  w.state.crates.filter((c) => !c.contents.length && c.capacity === 4).length === 2 &&
    w.stats().returned === 2,
);
invariants("整箱交付后");
assert("同一预留不能二次交付", w.consume(w.state.reservations[0]?.id ?? "none") === null);

// 4. 混批装箱与拆箱
w.makeCrate(8);
const c8 = w.state.crates.find((c) => !c.contents.length && c.capacity === 8)!;
w.add("corn", 4, 2, hour, "混批A");
w.add("corn", 4, 1, hour, "混批B");
w.pack(c8.id, w.state.batches.find((b) => b.source === "混批A")!.id, 4);
w.pack(c8.id, w.state.batches.find((b) => b.source === "混批B")!.id, 4);
invariants("混批装箱");
const mixed = w.state.crates.find((c) => c.id === c8.id)!.contents;
assert("混批保留各自品质", mixed[0]!.quality === 2 && mixed[1]!.quality === 1);
assert("不同商品不可同箱", (() => {
  w.add("berry", 2, 1, hour, "异类");
  return w.pack(c8.id, w.state.batches.find((b) => b.source === "异类")!.id, 1) === false;
})());
const looseBefore = totals().loose;
assert("拆箱后批次回散装", w.unpack(c8.id) && totals().loose === looseBefore + 8);
invariants("拆箱后");

// 5. 装箱不能延寿；过期只能拆出完好份额
w.makeCrate(8);
const c9 = w.state.crates.find((c) => !c.contents.length && c.capacity === 8)!;
w.add("carrot", 3, 2, hour, "鲜A");
w.add("carrot", 3, 1, hour - 60, "陈B");
const old = w.state.batches.find((b) => b.source === "陈B")!;
w.pack(c9.id, w.state.batches.find((b) => b.source === "鲜A")!.id, 3);
w.pack(c9.id, old.id, 3);
const oldExpires = old.expires;
assert("箱内批次保持原到期时刻", w.state.crates.find((c) => c.id === c9.id)!.contents.find((b) => b.source === "陈B")!.expires === oldExpires);
hour = oldExpires;
w.tick(hour);
assert("过期箱不能整箱倒出", w.unpack(c9.id) === false);
assert("只拆出尚完好份额", w.salvage(c9.id) === 3);
invariants("拆完好份额");

// 6. 保存 / 恢复守恒
const snap = JSON.parse(JSON.stringify(w.snapshot()));
const w2 = createWarehouse(() => hour, notice);
w2.restore(snap);
const restored = {
  loose: w2.state.batches.reduce((n, b) => n + b.quantity, 0),
  inCrates: w2.state.crates.reduce((n, c) => n + crateLoad(c), 0),
  reserved: w2.state.reservations
    .flatMap((r) => r.allocations)
    .reduce((n, a) => n + a.quantity, 0),
};
const now = totals();
assert(
  "保存恢复：散装/箱内/锁定/箱数同时守恒",
  restored.loose === now.loose &&
    restored.inCrates === now.inCrates &&
    restored.reserved === now.reserved &&
    w2.state.crates.length === w.state.crates.length,
);

// 7. 旧存档原商品保持散装
const w3 = createWarehouse(() => hour, notice);
w3.restore({
  batches: snap.batches.filter(
    (b: { item: string }) => !/wood|fiber/.test(b.item),
  ),
  reservations: [],
  serial: 900,
  wasted: 0,
} as never);
assert("旧存档不凭空生成箱子", w3.state.crates.length === 0);
assert("旧存档商品仍是散装", w3.state.batches.length > 0);

// 8. 取消配货守恒
const oq: Order = {
  id: "oq",
  item: "corn",
  quantity: 2,
  reward: 1,
  minQuality: 1,
  deadline: hour + 99,
  status: "open",
};
const before2 = totals();
const cratesBefore = w.state.crates.length;
const reserved = w.reserveOrder(oq);
assert("取消前散装份额被锁定", reserved !== null);
w.release(reserved!.id);
assert("取消配货释放锁定", w.state.reservations.length === 0);
assert(
  "取消配货后数量与箱数守恒",
  totals().loose === before2.loose &&
    totals().inCrates === before2.inCrates &&
    w.state.crates.length === cratesBefore &&
    totals().reserved === 0,
);

console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exitCode = failed ? 1 : 0;

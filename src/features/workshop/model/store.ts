import { reactive, readonly } from "vue";
import type { Job, Item, Notice, Receipt } from "../../../shared/contracts";
import { recipeById } from "../lib/recipes";
import { items } from "../../../shared/catalog";
import { queueFinish } from "../lib/schedule";
import { crateKindFor } from "../../../shared/crates";
interface Ports {
  reserve: (
    owner: string,
    item: Item,
    n: number,
    minQuality?: number,
  ) => string | null;
  consume: (id: string) => Receipt | null;
  /** 同时结算多份原料；任一失效则不扣任何一份。 */
  consumeMany?: (ids: string[]) => Receipt | null;
  release: (id: string) => void;
  add: (
    item: Item,
    n: number,
    q?: number,
    hour?: number,
    source?: string,
  ) => void;
  /** 有可用箱子时直接装箱入仓；返回 false 表示保留散装。 */
  addPacked?: (
    item: Item,
    n: number,
    q?: number,
    hour?: number,
    source?: string,
  ) => boolean;
  makeCrate: (capacity: number) => void;
  spend: (n: number) => boolean;
}
export function createWorkshop(ports: Ports, notice: Notice) {
  const state = reactive({ jobs: [] as Job[], serial: 0 });
  return {
    state: readonly(state),
    enqueue(recipe: string, hour: number) {
      const r = recipeById(recipe);
      if (!r || state.jobs.filter((j) => j.status === "queued").length >= 4) {
        notice("加工队列已满");
        return;
      }
      const reservations: string[] = [];
      const inputs: { item: Item; amount: number }[] = [
        { item: r.input, amount: r.amount },
      ];
      if (r.extraInput && r.extraAmount)
        inputs.push({ item: r.extraInput, amount: r.extraAmount });
      for (const input of inputs) {
        const id = ports.reserve("workshop", input.item, input.amount);
        if (!id) {
          reservations.forEach((x) => ports.release(x));
          notice(
            r.output === "crate" ? "木材或纤维不足" : "加工原料不足",
          );
          return;
        }
        reservations.push(id);
      }
      if (!ports.spend(r.cost)) {
        reservations.forEach((x) => ports.release(x));
        notice("加工费不足");
        return;
      }
      state.jobs.push({
        id: `j${++state.serial}`,
        recipe,
        reservation: reservations[0]!,
        reservations,
        finish: queueFinish(state.jobs, hour, r.duration),
        status: "queued",
      });
      notice(
        r.output === "crate"
          ? "木材与纤维已锁定，开始制作箱子"
          : "原料已锁定，加入加工队列",
      );
    },
    tick(hour: number) {
      for (const job of state.jobs)
        if (job.status === "queued" && job.finish <= hour) {
          const ids = job.reservations ?? [job.reservation!];
          // 全部原料（木材 + 纤维）在同一时刻结算，缺一不可。
          const receipt = ports.consumeMany
            ? ports.consumeMany(ids)
            : ids
                .map((id) => ports.consume(id))
                .reduce<Receipt | null>(
                  (acc, r) =>
                    acc && r
                      ? {
                          quality: Math.min(acc.quality, r.quality),
                          sources: [...acc.sources, ...r.sources],
                          quantity: acc.quantity + r.quantity,
                        }
                      : null,
                  { quality: Infinity, sources: [], quantity: 0 },
                );
          if (!receipt) {
            ids.forEach((id) => ports.release(id));
            job.status = "failed";
            notice("原料已过期，本批加工终止");
            continue;
          }
          job.receipt = receipt;
          job.status = "ready";
        }
    },
    claim(id: string, hour: number) {
      const job = state.jobs.find((j) => j.id === id),
        r = job && recipeById(job.recipe);
      if (!job || job.status !== "ready" || !r) return;
      if (!job.receipt) return;
      if (r.output === "crate") {
        // 空箱进入真实仓库，箱子可再次周转。
        ports.makeCrate(r.capacity!);
        job.status = "claimed";
        notice(`${crateKindFor(r.capacity!).name}已入仓，可用来装箱`);
        return;
      }
      if (job.finish + items[r.output].life <= hour) {
        job.status = "failed";
        notice("成品存放过久，已变质");
        return;
      }
      const source = `工坊${job.id} · ${job.receipt.sources.join(" / ")}`;
      const packed =
        ports.addPacked?.(
          r.output,
          r.quantity,
          job.receipt.quality,
          job.finish,
          source,
        ) ?? false;
      if (!packed)
        ports.add(
          r.output,
          r.quantity,
          job.receipt.quality,
          job.finish,
          source,
        );
      job.status = "claimed";
      notice(packed ? "成品已装入可用箱入仓" : "成品已散装入仓");
    },
    snapshot: () => JSON.parse(JSON.stringify(state)) as typeof state,
    restore: (data: Partial<typeof state>) => {
      Object.assign(state, { jobs: [], serial: 0, ...data });
    },
  };
}

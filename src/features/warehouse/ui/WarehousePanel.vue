<script setup lang="ts">
import { ref } from "vue";
import type { Batch } from "../../../shared/contracts";
import { items } from "../../../shared/catalog";
import { crateKindFor } from "../../../shared/crates";
type BoxView = {
  readonly id: string;
  readonly capacity: number;
  readonly broken: boolean;
  readonly trips: number;
  readonly contents: readonly Readonly<Batch>[];
};
const props = defineProps<{
  batches: readonly Readonly<Batch>[];
  crates: readonly BoxView[];
  hour: number;
  free: (id: string) => number;
  wasted: number;
  stats: { built: number; returned: number; empty: number; total: number };
}>();
defineEmits<{
  sell: [id: string];
  pack: [crateId: string, batchId: string, n: number | "fill"];
  unpack: [crateId: string];
  salvage: [crateId: string];
  repair: [crateId: string];
}>();
const load = (crate: BoxView) =>
  crate.contents.reduce((n, b) => n + b.quantity, 0);
const crateFreeOf = (crate: BoxView) =>
  crate.broken ? 0 : crate.capacity - load(crate);
const openCratesFor = (item: Batch["item"]) =>
  props.crates.filter(
    (c) =>
      !c.broken &&
      crateFreeOf(c) > 0 &&
      (!c.contents.length || c.contents[0]!.item === item),
  );
const targets = ref<Record<string, string>>({});
const targetFor = (batchId: string) => targets.value[batchId] ?? "";
const choose = (batchId: string, crateId: string) => {
  targets.value = { ...targets.value, [batchId]: crateId };
};
</script>
<template>
  <section class="panel warehouse-panel">
    <div class="panel-heading">
      <h2>谷仓库存</h2>
      <span
        >{{ batches.length }} 批散装 · {{ crates.length }} 只箱子 · 损耗
        {{ wasted }}</span
      >
    </div>
    <div class="crate-bar">
      <span
        >箱子周转：制作 {{ stats.built }} · 回收 {{ stats.returned }} · 空闲
        {{ stats.empty }} 只</span
      ><small>工坊制作木箱，订单返还空箱</small>
    </div>
    <div class="inventory-list">
      <div v-for="batch in batches" :key="batch.id" class="inventory-row">
        <b class="item-icon">{{ items[batch.item].icon }}</b>
        <div>
          <strong
            >{{ items[batch.item].name }}
            <em>{{ "★".repeat(batch.quality) }}</em></strong
          ><small
            >{{ batch.id }} · {{ batch.source }} ·
            {{
              items[batch.item].material
                ? "包装原料"
                : `${batch.expires - hour}h 后到期`
            }}</small
          >
        </div>
        <div class="quantity">
          <strong>×{{ batch.quantity }}</strong
          ><small>可用 {{ free(batch.id) }}</small>
        </div>
        <select
          class="pack-target"
          :value="targetFor(batch.id)"
          :disabled="!free(batch.id) || !openCratesFor(batch.item).length"
          @change="
            (e) => choose(batch.id, (e.target as HTMLSelectElement).value)
          "
        >
          <option value="">装进…</option>
          <option
            v-for="c in openCratesFor(batch.item)"
            :key="c.id"
            :value="c.id"
          >
            {{ c.id }} · 余 {{ crateFreeOf(c) }}
          </option>
        </select>
        <button
          :disabled="!free(batch.id) || !targetFor(batch.id)"
          @click="$emit('pack', targetFor(batch.id), batch.id, 'fill')"
        >
          装箱</button
        ><button :disabled="!free(batch.id)" @click="$emit('sell', batch.id)">
          卖 1
        </button>
      </div>
      <p v-if="!batches.length" class="empty">散装区空了，去田里收获吧。</p>
    </div>
    <div v-if="crates.length" class="crate-list">
      <div
        v-for="crate in crates"
        :key="crate.id"
        class="crate-row"
        :class="{ broken: crate.broken }"
      >
        <b class="item-icon">{{
          crate.broken ? "💥" : crateKindFor(crate.capacity).icon
        }}</b>
        <div>
          <strong
            >{{ crateKindFor(crate.capacity).name }} {{ crate.id }}
            <em>{{ load(crate) }}/{{ crate.capacity }}</em></strong
          ><small v-if="crate.broken">坏箱 · 只能拆出完好份额或修复</small
          ><small v-else-if="!crate.contents.length">空箱 · 可周转</small>
          <small v-else
            ><template v-for="(b, i) in crate.contents" :key="b.id"
              >{{ i ? " + " : "" }}{{ items[b.item].name }} ×{{ b.quantity }}
              {{ "★".repeat(b.quality) }} ({{
                items[b.item].material
                  ? "原料"
                  : `${b.expires - hour}h`
              }})</template
            ></small
          >
        </div>
        <div class="crate-actions">
          <button
            :disabled="crate.broken || !crate.contents.length"
            @click="$emit('unpack', crate.id)"
          >
            拆箱</button
          ><button
            :disabled="
              !crate.contents.length ||
              (!crate.broken && crate.contents.every((b) => b.expires > hour))
            "
            @click="$emit('salvage', crate.id)"
          >
            拆完好份额</button
          ><button v-if="crate.broken" @click="$emit('repair', crate.id)">
            修复</button
          >
        </div>
      </div>
    </div>
    <p class="hint">
      装箱占用真实容器与商品份额 · 箱内批次保留各自品质与保质 · 装箱不会延长保质期
    </p>
  </section>
</template>

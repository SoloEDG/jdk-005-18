<script setup lang="ts">
import type { Job } from "../../../shared/contracts";
import { items } from "../../../shared/catalog";
import { crateKinds } from "../../../shared/crates";
import { craftRecipes, crateRecipes, recipeById } from "../lib/recipes";
import { queueProgress } from "../lib/schedule";
type JobView = Readonly<Omit<Job, "reservations">> & {
  readonly reservations?: readonly string[];
};
defineProps<{ jobs: readonly JobView[]; hour: number }>();
defineEmits<{ enqueue: [recipe: string]; claim: [id: string] }>();
const label = (id: string) => {
  const r = recipeById(id)!;
  return r.output === "crate" ? r.name : items[r.output].name;
};
const outputIcon = (r: (typeof craftRecipes)[number]) =>
  r.output === "crate"
    ? crateKinds.find((k) => k.capacity === r.capacity)?.icon
    : items[r.output].icon;
</script>
<template>
  <section class="panel workshop-panel">
    <div class="panel-heading">
      <h2>手作工坊</h2>
      <span>单机顺序加工</span>
    </div>
    <div class="recipe-group-label">食品加工</div>
    <div class="recipe-list">
      <button
        v-for="r in craftRecipes"
        :key="r.id"
        @click="$emit('enqueue', r.id)"
      >
        <b>{{ outputIcon(r) }}</b
        ><strong>{{ r.name }}</strong
        ><small
          >{{ r.amount }} {{ items[r.input].name }} →
          {{ r.quantity }} 份<br />{{ r.duration }}h · ¥{{ r.cost }}</small
        ><span>＋ 制作</span>
      </button>
    </div>
    <div class="recipe-group-label">周转木箱</div>
    <div class="recipe-list crate-recipes">
      <button
        v-for="r in crateRecipes"
        :key="r.id"
        @click="$emit('enqueue', r.id)"
      >
        <b>{{ outputIcon(r) }}</b
        ><strong>{{ r.name }}</strong
        ><small
          >{{ r.amount }} 木材 + {{ r.extraAmount }} 纤维<br />容纳
          {{ r.capacity }} 份 · {{ r.duration }}h · ¥{{ r.cost }}</small
        ><span>＋ 制作</span>
      </button>
    </div>
    <div
      v-for="job in jobs.filter((j) => j.status !== 'claimed')"
      :key="job.id"
      class="job-row"
    >
      <span>{{ label(job.recipe) }} <small>{{ job.id }}</small></span
      ><template v-if="job.status === 'queued'"
        ><progress
          :value="
            queueProgress(job.finish, hour, recipeById(job.recipe)!.duration)
          "
          max="100"
        ></progress
        ><small>还需 {{ job.finish - hour }}h</small></template
      ><button
        v-else-if="job.status === 'ready'"
        class="primary"
        @click="$emit('claim', job.id)"
      >
        {{
          recipeById(job.recipe)!.output === "crate" ? "领取空箱" : "领取成品"
        }}
        {{ "★".repeat(job.receipt?.quality ?? 1) }}</button
      ><small v-else>加工失败</small>
    </div>
    <p v-if="!jobs.some((j) => j.status !== 'claimed')" class="hint">
      机器空闲中，让丰收多一点价值。
    </p>
  </section>
</template>

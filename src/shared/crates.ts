export interface CrateKind {
  capacity: number;
  name: string;
  icon: string;
  /** 制作一只空箱所需原料。 */
  wood: number;
  fiber: number;
  duration: number;
  cost: number;
}
/** 可周转木箱的规格。容量等于装箱后可容纳的商品份额。 */
export const crateKinds: readonly CrateKind[] = [
  {
    capacity: 4,
    name: "小木箱",
    icon: "📦",
    wood: 2,
    fiber: 1,
    duration: 2,
    cost: 1,
  },
  {
    capacity: 8,
    name: "中木箱",
    icon: "🧺",
    wood: 4,
    fiber: 2,
    duration: 3,
    cost: 2,
  },
  {
    capacity: 16,
    name: "大木箱",
    icon: "🗃️",
    wood: 7,
    fiber: 4,
    duration: 4,
    cost: 3,
  },
];
export const crateKindFor = (capacity: number): CrateKind =>
  crateKinds.find((k) => k.capacity === capacity) ?? {
    capacity,
    name: `${capacity} 格箱`,
    icon: "📦",
    wood: 0,
    fiber: 0,
    duration: 0,
    cost: 0,
  };

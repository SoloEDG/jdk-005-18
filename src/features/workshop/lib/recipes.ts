import type { Item } from "../../../shared/contracts";
import { crateKinds } from "../../../shared/crates";
export interface Recipe {
  id: string;
  name: string;
  /** 主要原料。木箱配方额外需要纤维。 */
  input: Item;
  amount: number;
  extraInput?: Item;
  extraAmount?: number;
  output: Item | "crate";
  quantity: number;
  duration: number;
  cost: number;
  /** 产出空箱的容量（仅木箱配方）。 */
  capacity?: number;
}
export const recipes: Recipe[] = [
  {
    id: "jam",
    name: "莓果酱",
    input: "berry",
    amount: 3,
    output: "jam",
    quantity: 2,
    duration: 8,
    cost: 4,
  },
  {
    id: "flour",
    name: "玉米粉",
    input: "corn",
    amount: 4,
    output: "flour",
    quantity: 3,
    duration: 6,
    cost: 3,
  },
  // 箱子配方直接取自共享规格，容量、用料与耗时只维护一份。
  ...crateKinds.map(
    (kind): Recipe => ({
      id: `crate-${kind.capacity}`,
      name: kind.name,
      input: "wood",
      amount: kind.wood,
      extraInput: "fiber",
      extraAmount: kind.fiber,
      output: "crate",
      quantity: 1,
      duration: kind.duration,
      cost: kind.cost,
      capacity: kind.capacity,
    }),
  ),
];
export const recipeById = (id: string) => recipes.find((r) => r.id === id);
export const craftRecipes = recipes.filter((r) => r.output !== "crate");
export const crateRecipes = recipes.filter((r) => r.output === "crate");

import type { Item } from "./contracts";
export const items: Record<
  Item,
  {
    name: string;
    icon: string;
    life: number;
    value: number;
    /** 包装原料不按食品展示保质期。 */
    material?: boolean;
  }
> = {
  carrot: { name: "胡萝卜", icon: "🥕", life: 72, value: 8 },
  corn: { name: "玉米", icon: "🌽", life: 96, value: 12 },
  berry: { name: "蓝莓", icon: "🫐", life: 48, value: 15 },
  jam: { name: "莓果酱", icon: "🫙", life: 120, value: 40 },
  flour: { name: "玉米粉", icon: "🌾", life: 120, value: 32 },
  wood: { name: "木材", icon: "🪵", life: 100000, value: 6, material: true },
  fiber: { name: "纤维", icon: "🧵", life: 100000, value: 5, material: true },
};
export const itemName = (item: Item) => items[item].name;
export const hourLabel = (hour: number) =>
  `第${Math.floor(hour / 24) + 1}天 ${String(hour % 24).padStart(2, "0")}:00`;

export type Item =
  | "carrot"
  | "corn"
  | "berry"
  | "jam"
  | "flour"
  | "wood"
  | "fiber";
export type Weather = "sun" | "rain" | "wind";
export interface Crop {
  item: Item;
  planted: number;
  growth: number;
  water: number;
  stress: number;
  harvests: number;
}
export interface Plot {
  id: number;
  crop: Crop | null;
}
export interface Receipt {
  quality: number;
  sources: readonly string[];
  quantity: number;
}
export interface Batch {
  id: string;
  item: Item;
  quantity: number;
  quality: number;
  source: string;
  expires: number;
}
/**
 * 一只真实的包装箱。空箱与装有货物的箱子都留在同一个 crate 列表里，
 * 箱子身份（id）跟随箱内货物一起移动，拆箱后身份回到空箱。
 */
export interface Crate {
  id: string;
  capacity: number;
  contents: Batch[];
  broken: boolean;
  trips: number;
}
export interface Allocation {
  batch: string;
  quantity: number;
}
export interface Reservation {
  id: string;
  owner: string;
  allocations: Allocation[];
  /** 整箱锁定：箱内批次不再单独占用 loose 库存。 */
  crates?: string[];
}
export interface Job {
  id: string;
  recipe: string;
  reservation?: string;
  /** 木箱配方需要同时锁定木材与纤维。 */
  reservations?: string[];
  receipt?: Receipt;
  finish: number;
  status: "queued" | "ready" | "claimed" | "failed";
}
export interface CrateRequest {
  /** 客户指定的箱型容量。 */
  capacity: number;
  /** 签收后返还的空箱数量（0 表示客户留下箱子）。 */
  empties: number;
}
export interface Order {
  id: string;
  item: Item;
  quantity: number;
  reward: number;
  minQuality: number;
  deadline: number;
  status: "open" | "reserved" | "delivered" | "expired";
  reservation?: string;
  /** 有此字段时，订单要求把货物整箱交付。 */
  crate?: CrateRequest;
}
export interface Tick {
  from: number;
  to: number;
  weather: Weather;
}
export type Notice = (message: string) => void;

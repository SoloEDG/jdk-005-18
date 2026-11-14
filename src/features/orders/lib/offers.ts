import type { Order } from "../../../shared/contracts";
import { crateKinds } from "../../../shared/crates";
export function initialOrders(hour: number): Order[] {
  return [
    {
      id: "o1",
      item: "carrot",
      quantity: 5,
      reward: 70,
      minQuality: 1,
      deadline: hour + 36,
      status: "open",
    },
    {
      id: "o2",
      item: "jam",
      quantity: 2,
      reward: 120,
      minQuality: 2,
      deadline: hour + 48,
      status: "open",
    },
    {
      id: "o3",
      item: "flour",
      quantity: 3,
      reward: 100,
      minQuality: 1,
      deadline: hour + 60,
      status: "open",
    },
    {
      id: "o4",
      item: "carrot",
      quantity: 8,
      reward: 150,
      minQuality: 1,
      deadline: hour + 54,
      status: "open",
      crate: { capacity: 4, empties: 2 },
    },
  ];
}
export function nextOrder(serial: number, hour: number): Order {
  const item = serial % 2 ? "corn" : "berry";
  // 每三张新订单里有一张要求整箱交付。
  const crate =
    serial % 3 === 0
      ? { capacity: crateKinds[serial % 2].capacity, empties: 1 }
      : undefined;
  return {
    id: `o${serial}`,
    item,
    quantity: crate ? crate.capacity : 4,
    reward: (crate ? 130 : 90) + serial * 3,
    minQuality: serial % 3 === 0 ? 2 : 1,
    deadline: hour + 48,
    status: "open",
    crate,
  };
}

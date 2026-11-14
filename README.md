# 青禾农场

安装：`npm install`

本地启动：`npm run dev`

Docker 启动：`docker compose -p pinru-jdk005-1113 up --build`，打开 http://localhost:18025 。

## 周转包装箱

- 播种木材、纤维两种包装材料作物，收获后按批次进入谷仓。
- 工坊新增小 / 中 / 大三档木箱配方，消耗木材 + 纤维制作空箱，空箱真实入仓。
- 谷仓里可把散装批次装进带箱号的容器：箱子占用真实容器与商品份额，
  箱内批次保留各自品质与保质期，装箱不会延长寿命。
- 整箱订单要求按指定箱型整箱交付，签收后按约定返还空箱（保留原箱号）。
- 箱内食品过期或箱子损坏时只能拆出尚完好的份额；同一只箱子不能交付两次。
- 工坊领货会优先装进可用的空箱，没有合适箱子则保留散装。
- 旧存档缺少箱子字段时原有商品按散装恢复；混批装箱、取消配货、保存恢复
  都会同时守恒箱数、货物数量与已锁定份额。

回归脚本：`node_modules/.bin/esbuild scripts/check-crates.ts --bundle --platform=node --format=cjs --outfile=/tmp/check-crates.cjs && node /tmp/check-crates.cjs`

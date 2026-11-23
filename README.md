# AI Campus Flow

AI 個人化校園行程助手，四人團隊競賽原型。

## 開始使用

```bash
npm install
npm run dev
```

## V2 功能

- 一鍵載入中大 Demo 情境（課表、需求、排好的行程，開啟即有畫面）
- 規則式智慧排程：空堂 × 步行時間 × 人潮模擬 × 截止時間，並附「推薦理由」
- 時間緊繃 / 衝突偵測 + 「AI 一鍵重新調配」
- 偏好權重（避開人潮 / 最短步行 / 高效率專注）、換地點、調整順序、勾選完成
- 數據來源標示：人潮與空位率皆為模擬估算
- `vercel.json` rewrite，重新整理不會 404

## 舊功能

- 課表新增、刪除與衝突檢查
- 校園示範地點人潮分級
- 依課表空堂與任務產生行程
- 瀏覽器本機資料保存
- PWA manifest

**重要：** 人潮資料為示範數據，排程為規則式演算法，並非真實 AI 預測。請勿當作即時校園資訊。

## 部署

執行 `npm run build`，將 `dist` 部署至靜態網站服務（例如 Vercel）。


## v2 重構摘要
- 結構：`src/pages/*`（頁面）、`src/engine/*`（排程、人潮）、`src/store.js`（localStorage 驗證/遷移）、`src/data/*`。
- 指令：`npm test`（node:test）、`npm run build`。
- 資料誠實：人潮分「模擬／觀察／模型」三種來源；統計模型已實作，但尚無真實資料通過驗證（示範模式），詳見 `docs/ai-architecture.md`。
- 資料庫評估：`docs/supabase-plan.md`、`supabase/schema.sql`（草案，未部署）。

## 測試
- `npm test`：單元／不變條件／一致性（Planner 216 種情境）／模型／餐廳清單守門測試。
- 手機端對端：`npm run build && npx vite preview --port 4173`，另開終端機 `python3 -I e2e/mobile.py`（需 Playwright + Chromium）。
- 團隊同步端對端（假伺服器）：見 `e2e/sync.py` 開頭註解。

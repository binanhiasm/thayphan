// API của Thầy Phán trên Vercel. Trang tĩnh nằm ở public/ (xem vercel.json).
// Trên Vercel nên gắn Upstash Redis (Marketplace) để bộ đếm và câu phán đã nhớ dùng chung giữa các lần chạy hàm.
import { makeAsk } from "../lib/claude.js";
import { createPhanHandler, limitsFromEnv } from "../lib/phan.js";
import { storeFromEnv } from "../lib/store.js";

const store = storeFromEnv();
if (store.kind === "memory") console.warn("[thayphan] Chưa gắn Redis: giới hạn lượt gọi chỉ tính riêng từng máy chạy hàm, không chính xác.");

export default createPhanHandler({ store, ask: makeAsk(), limits: limitsFromEnv() });

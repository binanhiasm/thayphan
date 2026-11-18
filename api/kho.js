// GET /api/kho trên Vercel: nhóm câu của thầy (trang vận hành sửa được). CDN giữ 60 giây.
import { createKhoHandler } from "../lib/kho.js";
import { storeFromEnv } from "../lib/store.js";

export default createKhoHandler({ store: storeFromEnv() });

// API trang vận hành trên Vercel (/ops/). Cần biến OPS_PASSWORD; không có thì API này tắt.
import { createOpsHandler } from "../lib/ops.js";
import { storeFromEnv } from "../lib/store.js";
import { secretFromEnv } from "../lib/token.js";

export default createOpsHandler({ store: storeFromEnv(), secret: secretFromEnv(), password: process.env.OPS_PASSWORD });

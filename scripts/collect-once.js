// 최근 N일 수집 1회 실행 (로컬 테스트/수동 갱신용)
// 사용법: npm run collect            (기본 10일)
//         npm run collect -- 30      (최근 30일)

import { loadEnv } from "./load-env.js";
loadEnv();
import { collectRecent } from "../lib/collectors/index.js";

const days = Number(process.argv[2]) || 10;
console.log(`[collect] 최근 ${days}일 수집…`);
const r = await collectRecent(days);
console.log("[collect] 완료:", JSON.stringify(r, null, 2));
process.exit(0);

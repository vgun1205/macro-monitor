// 과거 데이터 일괄 적재
// 사용법: npm run backfill -- 2023-12-01 2026-06-13
//   (기간 미지정 시 2023-12-01 ~ 오늘)
//
// 23/24/25년말 기준값 컬럼이 채워지려면 해당 연말을 포함하는 구간을 적재해야 합니다.

import { loadEnv } from "./load-env.js";
loadEnv();
import { collectRange } from "../lib/collectors/index.js";

const args = process.argv.slice(2);
const start = args[0] || "2023-12-01";
const end = args[1] || new Date().toISOString().slice(0, 10);

console.log(`[backfill] ${start} ~ ${end} 수집 시작…`);
const r = await collectRange(start, end);
console.log("[backfill] 완료:", JSON.stringify(r, null, 2));
console.log("※ 특수채 AAA / 회사채 AA- 10Y 스프레드는 자동수집 대상이 아니므로 화면에서 수기 입력하세요.");
process.exit(0);

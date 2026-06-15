import { collectEcos } from "./ecos.js";
import { collectFred } from "./fred.js";
import { collectEcb } from "./ecb.js";
import { collectYahoo } from "./yahoo.js";
import { upsertObservations } from "../db.js";

// startISO~endISO 구간의 모든 자동 출처를 수집해 DB upsert.
// 한 출처가 실패해도 나머지는 진행한다.
export async function collectRange(startISO, endISO) {
  const results = await Promise.allSettled([
    collectEcos(startISO, endISO),
    collectFred(startISO, endISO),
    collectEcb(startISO, endISO),
    collectYahoo(startISO, endISO),
  ]);

  const rows = [];
  const summary = {};
  const sources = ["ECOS", "FRED", "ECB", "Yahoo"];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      rows.push(...r.value);
      summary[sources[i]] = r.value.length;
    } else {
      summary[sources[i]] = `ERROR: ${r.reason?.message || r.reason}`;
    }
  });

  const upserted = await upsertObservations(rows);
  return { upserted, fetched: rows.length, bySource: summary };
}

// 최근 N일 수집 (Cron 기본 동작)
export async function collectRecent(days = 10) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return collectRange(iso(start), iso(end));
}

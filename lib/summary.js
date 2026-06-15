// 카톡/메일용 일일 요약 텍스트 생성 (핵심 지표 + 전일 대비)
import { getLatestTwo } from "./db.js";

const PICK = [
  ["ktb3y", "국고3Y", "rate"],
  ["ktb10y", "국고10Y", "rate"],
  ["ust10y", "미국10Y", "rate"],
  ["usdkrw", "원/달러", "fx"],
  ["kospi", "코스피", "idx"],
];

export async function buildSummary(baseUrl) {
  const ids = PICK.map((p) => p[0]);
  const rows = await getLatestTwo(ids);
  const by = {};
  for (const r of rows) (by[r.indicator] ??= []).push(r);

  let date = "";
  const lines = [];
  for (const [id, label, kind] of PICK) {
    const arr = by[id];
    if (!arr || !arr.length) continue;
    const cur = Number(arr[0].value);
    const prev = arr[1] != null ? Number(arr[1].value) : null;
    if (!date) date = arr[0].d;
    const arrow = (x) => (x > 0 ? "▲" : x < 0 ? "▼" : "·");
    let valStr, dStr = "";
    if (kind === "rate") {
      valStr = cur.toFixed(2);
      if (prev != null) { const bp = Math.round((cur - prev) * 100); dStr = ` (${arrow(bp)}${Math.abs(bp)}bp)`; }
    } else if (kind === "fx") {
      valStr = Math.round(cur).toLocaleString("ko-KR");
      if (prev != null) { const d = cur - prev; dStr = ` (${arrow(d)}${Math.abs(d).toFixed(1)})`; }
    } else {
      valStr = Math.round(cur).toLocaleString("ko-KR");
      if (prev != null && prev !== 0) { const p = (cur / prev - 1) * 100; dStr = ` (${arrow(p)}${Math.abs(p).toFixed(1)}%)`; }
    }
    lines.push(`${label} ${valStr}${dStr}`);
  }
  const md = date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` : "";
  const text = `[거시모니터] ${md} 기준\n` + lines.join("\n");
  return { text, url: baseUrl, date };
}

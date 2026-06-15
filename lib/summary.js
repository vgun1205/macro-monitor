// 카톡/메일용 일일 요약 (전 지표 현재값 + 전일비, 그룹별 압축 — 카톡 200자 제한 대응)
// 200자 초과 시 자동으로 증감을 빼고 레벨만 발송(절대 중간에서 잘리지 않게).
import { getLatestTwo } from "./db.js";

const GROUPS = [
  ["국고", "rate", [["ktb3y", "3Y"], ["ktb5y", "5Y"], ["ktb10y", "10Y"], ["ktb20y", "20Y"], ["ktb30y", "30Y"]]],
  ["미국", "rate", [["ust5y", "5Y"], ["ust10y", "10Y"], ["ust20y", "20Y"], ["ust30y", "30Y"]]],
  ["유럽", "rate", [["eu10y", "10Y"], ["eu20y", "20Y"]]],
  ["환율", "fx", [["usdkrw", "$"], ["eurkrw", "€"]]],
  ["주가", "idx", [["kospi", "코스피"], ["samsung", "삼성"]]],
];

const arrow = (x) => (x > 0 ? "▲" : x < 0 ? "▼" : "");

function cell(kind, lbl, c, p, withDelta) {
  if (c == null) return null;
  const lvl = kind === "rate" ? c.toFixed(2) : Math.round(c).toLocaleString("ko-KR");
  if (!withDelta || p == null) return `${lbl}${lvl}`;
  let d = "";
  if (kind === "rate") { const bp = Math.round((c - p) * 100); if (bp) d = `${arrow(bp)}${Math.abs(bp)}`; }
  else if (kind === "fx") { const x = Math.round(c - p); if (x) d = `${arrow(x)}${Math.abs(x)}`; }
  else if (p !== 0) { const pct = (c / p - 1) * 100; if (Math.abs(pct) >= 0.05) d = `${arrow(pct)}${Math.abs(pct).toFixed(1)}%`; }
  return `${lbl}${lvl}${d}`;
}

export async function buildSummary(baseUrl) {
  const ids = [...new Set(GROUPS.flatMap((g) => g[2].map((i) => i[0])))];
  const rows = await getLatestTwo(ids);
  const cur = {}, prev = {}, dateOf = {};
  for (const r of rows) {
    if (cur[r.indicator] === undefined) { cur[r.indicator] = Number(r.value); dateOf[r.indicator] = r.d; }
    else if (prev[r.indicator] === undefined) prev[r.indicator] = Number(r.value);
  }
  const dates = Object.values(dateOf).filter(Boolean).sort();
  const last = dates[dates.length - 1] || "";
  const md = last ? `${Number(last.slice(5, 7))}/${Number(last.slice(8, 10))}` : "";

  const build = (withDelta) => {
    const lines = [`[거시모니터] ${md}${withDelta ? " 전일비" : ""}`];
    for (const [tag, kind, items] of GROUPS) {
      const parts = [];
      for (const [id, lbl] of items) {
        const c = cell(kind, lbl, cur[id], prev[id], withDelta);
        if (c) parts.push(c);
      }
      if (parts.length) lines.push(`[${tag}] ${parts.join(" ")}`);
    }
    return lines.join("\n");
  };

  let text = build(true);
  if (text.length > 200) text = build(false); // 증감 제거(레벨만)로 폴백
  if (text.length > 200) text = text.slice(0, 200);
  return { text, url: baseUrl, date: last };
}

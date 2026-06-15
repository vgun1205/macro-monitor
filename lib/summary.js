// 카톡/메일용 일일 요약 텍스트 (전 지표 현재값, 그룹별 압축 — 카톡 200자 제한 대응)
import { getLatestTwo } from "./db.js";

const GROUPS = [
  ["국고", "rate", [["ktb3y", "3Y"], ["ktb5y", "5Y"], ["ktb10y", "10Y"], ["ktb20y", "20Y"], ["ktb30y", "30Y"]]],
  ["미국", "rate", [["ust5y", "5Y"], ["ust10y", "10Y"], ["ust20y", "20Y"], ["ust30y", "30Y"]]],
  ["유럽", "rate", [["eu10y", "10Y"], ["eu20y", "20Y"]]],
  ["환율", "fx", [["usdkrw", "$"], ["eurkrw", "€"]]],
  ["주가", "idx", [["kospi", "코스피"], ["samsung", "삼성"]]],
];
const EXTRA = ["corpAA3yYield"]; // 회사채AA-3Y 스프레드 계산용(= 수익률 − 국고3Y)

export async function buildSummary(baseUrl) {
  const ids = [...new Set([...GROUPS.flatMap((g) => g[2].map((i) => i[0])), ...EXTRA])];
  const rows = await getLatestTwo(ids);
  const latest = {}, dateOf = {};
  for (const r of rows) {
    if (latest[r.indicator] === undefined) { latest[r.indicator] = Number(r.value); dateOf[r.indicator] = r.d; }
  }
  const dates = Object.values(dateOf).filter(Boolean).sort();
  const last = dates[dates.length - 1] || "";
  const md = last ? `${Number(last.slice(5, 7))}/${Number(last.slice(8, 10))}` : "";

  const fmt = (kind, v) => (kind === "rate" ? v.toFixed(2) : Math.round(v).toLocaleString("ko-KR"));

  const lines = [`[거시모니터] ${md} 현재`];
  for (const [tag, kind, items] of GROUPS) {
    const parts = [];
    for (const [id, lbl] of items) {
      const v = latest[id];
      if (v == null) continue;
      parts.push(`${lbl}${fmt(kind, v)}`);
    }
    if (parts.length) lines.push(`[${tag}] ${parts.join(" ")}`);
  }
  let text = lines.join("\n");
  // 회사채 AA- 3Y 스프레드(%p) — 자리 남으면 추가
  if (latest.corpAA3yYield != null && latest.ktb3y != null) {
    const sp = (latest.corpAA3yYield - latest.ktb3y).toFixed(2);
    const cand = `${text}\n[신용] 회사채AA-3Y +${sp}%p`;
    if (cand.length <= 196) text = cand;
  }
  if (text.length > 200) text = text.slice(0, 200);
  return { text, url: baseUrl, date: last };
}

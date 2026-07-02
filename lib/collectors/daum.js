// Daum 금융 업종지수 수집기 — KOSPI 보험 업종지수(insuidx).
// KRX 공식 API는 봇 차단, Daum sectors API는 당일 지수(tradePrice)·전일 종가(prevClosingPrice)만 제공.
// → 매 수집 시: 전 영업일 종가는 항상 적재, 당일 값은 장 마감 후(KST 16시 이후)에만 종가로 적재.
//   과거 이력은 제공되지 않아 수집 시작일부터 축적됨(전월·연말비는 데이터가 쌓이면 표시).

const prevBizDay = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
};

export async function collectDaum() {
  const out = [];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch("https://finance.daum.net/api/quotes/sectors?market=KOSPI", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Referer: "https://finance.daum.net/domestic/sectors" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return out;
    const j = await res.json();
    const s = (j.data || j || []).find((x) => (x.sectorName || x.name) === "보험");
    if (!s || !s.date) return out;
    // 전 영업일 종가(항상)
    if (s.prevClosingPrice != null) out.push({ date: prevBizDay(s.date), indicator: "insuidx", value: s.prevClosingPrice, source: "Daum" });
    // 당일 값은 장 마감 후에만(종가 확정)
    const kstHour = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
    if (s.tradePrice != null && kstHour >= 16) out.push({ date: s.date, indicator: "insuidx", value: s.tradePrice, source: "Daum" });
  } catch (e) { console.error("[Daum] insuidx 실패:", e.message); }
  return out;
}

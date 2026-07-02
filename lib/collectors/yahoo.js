// Yahoo Finance chart API 수집기 — 코스피(^KS11) / 삼성전자(005930.KS) 일별 종가
// 비공식 엔드포인트(서버사이드 호출). 차단 시 KRX OpenAPI 등으로 교체 가능.

const YH_SYMBOLS = {
  kospi: "%5EKS11",   // ^KS11
  samsung: "005930.KS",   // 삼성전자
  samsungct: "028260.KS", // 삼성물산
  skt: "017670.KS",       // SK텔레콤
  skhynix: "000660.KS",   // SK하이닉스
  sksquare: "402340.KS",  // SK스퀘어
  samsungfire: "000810.KS", // 삼성화재
};

export async function collectYahoo(startISO, endISO) {
  const p1 = Math.floor(new Date(startISO + "T00:00:00Z").getTime() / 1000);
  const p2 = Math.floor(new Date(endISO + "T00:00:00Z").getTime() / 1000) + 86400;
  const out = [];
  for (const [ind, sym] of Object.entries(YH_SYMBOLS)) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?period1=${p1}&period2=${p2}&interval=1d`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;
      const ts = result.timestamp || [];
      const close = result.indicators?.quote?.[0]?.close || [];
      ts.forEach((t, i) => {
        const v = close[i];
        if (v == null) return;
        const date = new Date(t * 1000).toISOString().slice(0, 10);
        out.push({ date, indicator: ind, value: v, source: "Yahoo" });
      });
    } catch (e) {
      console.error(`[Yahoo] ${ind} 실패:`, e.message);
    }
  }
  return out;
}

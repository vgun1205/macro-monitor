// 한국은행 ECOS OpenAPI 수집기
// 문서: https://ecos.bok.or.kr/api/
//
// ★ 중요: 아래 statCode / itemCode 는 ECOS 통계표마다 다릅니다.
//   배포 전 ECOS '통계코드 검색' 또는 fetchEcosItemList()로 반드시 검증하세요.
//   (VERIFY 표시 항목은 코드가 바뀌었을 수 있음)

const ECOS_SERIES = [
  // indicator,      statCode,  cycle, itemCode,      비고
  { ind: "ktb3y",          stat: "817Y002", cycle: "D", item: "010200000" }, // 국고채(3년)
  { ind: "ktb5y",          stat: "817Y002", cycle: "D", item: "010200001" }, // 국고채(5년)  VERIFY
  { ind: "ktb10y",         stat: "817Y002", cycle: "D", item: "010210000" }, // 국고채(10년)
  { ind: "ktb20y",         stat: "817Y002", cycle: "D", item: "010220000" }, // 국고채(20년) VERIFY
  { ind: "ktb30y",         stat: "817Y002", cycle: "D", item: "010230000" }, // 국고채(30년) VERIFY
  { ind: "corpAA3yYield",  stat: "817Y002", cycle: "D", item: "010300000" }, // 회사채(3년,AA-) 수익률 VERIFY
  { ind: "usdkrw",         stat: "731Y001", cycle: "D", item: "0000001"  }, // 원/달러(매매기준율)
  { ind: "eurkrw",         stat: "731Y001", cycle: "D", item: "0000003"  }, // 원/유로 VERIFY
  { ind: "jpykrw",         stat: "731Y001", cycle: "D", item: "0000002"  }, // 원/일본엔(100엔)
];

const ymd = (iso) => iso.replace(/-/g, "");

export async function collectEcos(startISO, endISO) {
  const key = process.env.ECOS_API_KEY;
  if (!key) throw new Error("ECOS_API_KEY 미설정");
  const out = [];
  for (const s of ECOS_SERIES) {
    try {
      const url = `https://ecos.bok.or.kr/api/StatisticSearch/${key}/json/kr/1/2000/${s.stat}/${s.cycle}/${ymd(startISO)}/${ymd(endISO)}/${s.item}`;
      const res = await fetch(url);
      const json = await res.json();
      const rows = json?.StatisticSearch?.row || [];
      for (const r of rows) {
        const t = r.TIME; // YYYYMMDD
        if (!t || t.length < 8) continue;
        const date = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
        const v = parseFloat(r.DATA_VALUE);
        if (!isNaN(v)) out.push({ date, indicator: s.ind, value: v, source: "ECOS" });
      }
    } catch (e) {
      console.error(`[ECOS] ${s.ind} 실패:`, e.message);
    }
  }
  return out;
}

// 코드 검증용: 특정 통계표의 항목 목록 조회 (Claude Code/사용자가 itemCode 확인할 때 사용)
export async function fetchEcosItemList(statCode) {
  const key = process.env.ECOS_API_KEY;
  const url = `https://ecos.bok.or.kr/api/StatisticItemList/${key}/json/kr/1/200/${statCode}`;
  const res = await fetch(url);
  return res.json();
}

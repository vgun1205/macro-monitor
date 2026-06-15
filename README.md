# 거시지표 일별 모니터 (Macro Monitor)

국내·해외 금리, 환율, 신용스프레드, 주가를 매 영업일 자동 수집하여
**기준일 대비 전일·전월·전분기·전년** 비교를 보여주는 대시보드.

## 빠른 시작
```bash
npm install
cp .env.example .env        # 키 입력 (DATABASE_URL, ECOS_API_KEY, FRED_API_KEY, CRON_SECRET)
psql "$DATABASE_URL" -f scripts/schema.sql
npm run backfill -- 2023-12-01     # 과거 데이터 적재 (연말 기준값 포함)
npm run dev                         # http://localhost:3000
```

## 명령어
- `npm run dev` / `build` / `start` — Next.js
- `npm run backfill -- 2023-12-01 2026-06-13` — 기간 적재
- `npm run collect -- 10` — 최근 10일 1회 수집

## 데이터 출처
ECOS(국고채·환율·회사채AA-3년), FRED(미국 국채), ECB(유럽), Yahoo(코스피·삼성전자).
특수채 AAA / 회사채 AA- 10Y 스프레드는 평가사 유료데이터라 **수기 입력**.

## 구조
```
app/                Next.js (대시보드 + API)
  api/series        GET  전체 시계열
  api/manual        POST 수기/가져오기 upsert
  api/cron/collect  GET  Cron 진입점(자동 수집)
  components/MacroDashboard.jsx   UI
lib/
  db.js             Postgres
  collectors/       ecos · fred · ecb · yahoo · index(오케스트레이터)
scripts/            schema.sql · backfill · collect-once
vercel.json         Cron 스케줄
```

자세한 인수인계·미해결 결정은 **CLAUDE.md** 참고.

# CLAUDE.md — 프로젝트 인수인계 브리프 (Claude Code용)

이 파일은 **Claude Code가 이 프로젝트를 이어받아 완성·배포**하기 위한 지침서다.
사람 사용자(JH)는 금융회사 리스크관리 실무자이며, 결론-근거 구조의 전문적 산출물을 선호한다.

## 1. 목적 (한 줄)
국내·해외 금리, 환율, 신용스프레드, 주가를 **매 영업일 자동 수집**하여, 기준일 대비
전일·전월·전분기·전년 비교를 보여주는 웹 대시보드.

## 2. 아키텍처
```
[Vercel Cron] ─매 영업일─▶ GET /api/cron/collect
                                 └▶ lib/collectors/* (ECOS·FRED·ECB·Yahoo)
                                       └▶ upsert ─▶ [Postgres: observations]
[브라우저] ─▶ app/page.js (MacroDashboard) ─GET /api/series▶ [Postgres]
                                            ─POST /api/manual▶ (수기/가져오기)
```
- 프레임워크: Next.js 14 (App Router), JS/JSX, `"type":"module"`
- DB: Postgres (Neon/Supabase/Vercel Postgres). 스키마: `scripts/schema.sql`
- 데이터 모델: long format `observations(obs_date, indicator, value, source)`

## 3. 지표 ↔ 출처 매핑
| 지표 | id | 출처 | 비고 |
|---|---|---|---|
| 국고채 3/5/10/20/30Y | ktb3y… | ECOS 817Y002 | itemCode VERIFY |
| 미국 5/10/20/30Y | ust5y… | FRED DGS5/10/20/30 | 확정 |
| 유럽 10/20Y | eu10y/eu20y | ECB YC | 키 VERIFY |
| 원/달러·원/유로 | usdkrw/eurkrw | ECOS 731Y001 | eurkrw VERIFY |
| 코스피·삼성전자 | kospi/samsung | Yahoo ^KS11 / 005930.KS | 비공식 API |
| 회사채 AA- 3년 수익률 | corpAA3yYield | ECOS 817Y002 | 스프레드 계산용 |
| 미국 20Y/30Y 스프레드 | us_sp20/30 | **자동계산** | 장기물 − 10Y |
| 회사채 AA- 3Y 스프레드 | corp_aam_3y | **자동계산** | corpAA3yYield − ktb3y |
| 특수채 AAA 5Y/10Y, 회사채 AA- 10Y | sgb_aaa_*, corp_aam_10y | **수기** | 평가사 유료데이터 → 화면 입력 |

## 4. ★ 미해결 결정 2가지 (사용자 확인 필요 — 기본값 적용해 둠)
1. **미국 스프레드 정의**: 현재 `장기물 − 10Y`(20Y−10Y, 30Y−10Y)로 구현.
   만약 **한미 금리차**(예: 미국20Y − 국고20Y)를 의도했다면
   `app/components/MacroDashboard.jsx`의 `spread_us` 그룹 `from`을 수정:
   `us_sp20.from = ["ust20y","ktb20y"]`, `us_sp30.from = ["ust30y","ktb30y"]`.
2. **배포 환경**: 기본은 **Vercel + Neon Postgres + Vercel Cron**(완전 무인).
   사내 폐쇄망이면 §8 참고(로컬 Node + node-cron + SQLite로 전환).

## 5. 셋업 (로컬)
1. `npm install`
2. `.env.example` → `.env` 복사 후 키 입력 (DATABASE_URL, ECOS_API_KEY, FRED_API_KEY, CRON_SECRET)
   - ECOS 키: https://ecos.bok.or.kr/api/  (무료)
   - FRED 키: https://fred.stlouisfed.org/docs/api/api_key.html (무료)
   - DB: Neon(https://neon.tech) 무료 프로젝트 생성 → 연결문자열 복사
3. DB 스키마 적용: `psql "$DATABASE_URL" -f scripts/schema.sql`
4. ECOS itemCode 검증 (중요): `lib/collectors/ecos.js`의 `fetchEcosItemList("817Y002")`를
   임시 스크립트로 호출하거나 ECOS 사이트에서 국고채 5/20/30Y, 원/유로, 회사채 AA-3년의
   정확한 itemCode를 확인하고 `ECOS_SERIES`를 교정. (VERIFY 주석 항목)
5. 과거 적재: `npm run backfill -- 2023-12-01`  (23/24/25년말 기준값 확보)
6. 실행: `npm run dev` → http://localhost:3000

## 6. 배포 (Vercel)
1. GitHub 푸시 → Vercel 프로젝트 임포트
2. 환경변수 4개 등록 (위와 동일)
3. Cron 인증: Vercel Cron이 `Authorization: Bearer $CRON_SECRET`로 호출하도록
   Project Settings에서 설정(또는 vercel.json 유지 + 라우트의 시크릿 검사 확인).
4. `vercel.json`의 스케줄 `0 22 * * 1-5`(UTC) = 한국시각 익일 07:00. 미 증시 마감 후 시점.
   필요시 조정.
5. 배포 후 최초 1회 `npm run backfill`(로컬에서 prod DB로) 또는 `/api/cron/collect` 수동 호출.

## 7. Claude Code 할 일 체크리스트
- [ ] `npm install` 후 빌드 통과 확인 (`npm run build`)
- [ ] ECOS itemCode VERIFY 항목 검증·교정 (§5-4)
- [ ] ECB YC 키(SR_10Y/SR_20Y) 응답 확인, 안 되면 대체 시계열 탐색
- [ ] Yahoo 응답 정상 확인(차단 시 KRX OpenAPI로 교체 옵션 검토)
- [ ] §4 결정 2가지를 사용자에게 확인 후 반영
- [ ] backfill로 2023~현재 적재, 대시보드에서 23/24/25년말·월말·일별 정상 표출 확인
- [ ] Vercel 배포 + Cron 동작 확인(로그)
- [ ] (선택) 행 삭제 API(`DELETE /api/manual`)와 출처별 색상 배지 추가

## 8. 폐쇄망/로컬 대안 (배포가 사내망이어야 할 경우)
- DB를 SQLite(`better-sqlite3`)로 교체, `lib/db.js`만 수정.
- Cron 대신 `node-cron` 또는 OS 작업 스케줄러로 `npm run collect` 주기 실행.
- 단, 사내망에서 외부 API(ECOS/FRED/ECB/Yahoo) 아웃바운드 허용 필요. 불가 시
  사내 단말 데이터를 CSV로 받아 `import` 탭/`/api/manual`로 주입하는 반자동 운영.

## 9. 주의
- 사내 비공개 데이터(사규·내부수치)는 이 앱/외부 API에 입력하지 말 것. 본 앱은 공개 시장데이터 전용.
- 신용스프레드(평가사) 자동수집 불가 항목은 수기 입력이 정상 운영 방식.

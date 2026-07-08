import { collectRecent } from "../../../../lib/collectors/index.js";
import { getConfig, setConfig } from "../../../../lib/db.js";
import { refreshAccessToken, sendMemo } from "../../../../lib/kakao.js";
import { buildSummary } from "../../../../lib/summary.js";
import { sendReportMail, sendIssuesMail, sendArchiveMail, sendBriefingMail } from "../../../../lib/mail.js";
import { after } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 2026 한국 공휴일(주말은 별도 체크). 발송 제외용.
const KR_HOLIDAYS = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02",
  "2026-05-05", "2026-05-24", "2026-05-25", "2026-06-06", "2026-08-15",
  "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-09", "2026-12-25",
]);
function isSendDay() {
  const k = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const dow = k.getUTCDay();
  const iso = k.toISOString().slice(0, 10);
  return dow !== 0 && dow !== 6 && !KR_HOLIDAYS.has(iso); // 평일 & 비공휴일
}

// 수집 후 카카오 '나에게 보내기' 발송(설정돼 있을 때만, 실패해도 수집은 성공 처리)
async function notifyKakao() {
  if (!process.env.KAKAO_REST_API_KEY) return "skip(no-key)";
  const rt = (await getConfig("kakao_refresh_token")) || process.env.KAKAO_REFRESH_TOKEN;
  if (!rt) return "skip(no-token)";
  try {
    const tok = await refreshAccessToken(rt);
    if (!tok.access_token) return `token-fail:${JSON.stringify(tok)}`;
    if (tok.refresh_token && tok.refresh_token !== rt) await setConfig("kakao_refresh_token", tok.refresh_token);
    const base = process.env.APP_BASE_URL || "https://macro-monitor-sigma.vercel.app";
    const { text, url } = await buildSummary(base);
    const r = await sendMemo(tok.access_token, text, url);
    return r.result_code === 0 ? "sent" : `send-fail:${JSON.stringify(r)}`;
  } catch (e) {
    return `error:${e.message}`;
  }
}

export async function GET(req) {
  // Cron 보호: Vercel Cron은 Authorization: Bearer ${CRON_SECRET} 헤더를 전달하도록 설정
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    const key = new URL(req.url).searchParams.get("key") || ""; // URL 쿼리 인증(헤더 없이도 OK)
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const params = new URL(req.url).searchParams;
    if (params.get("diag") === "pdf") {
      const { debugPdf } = await import("../../../../lib/news.js");
      return Response.json(await debugPdf());
    }
    if (params.get("briefing") === "refresh") { // 주간 브리핑 강제 생성·저장(프라이밍/주간 갱신)
      const { refreshWeeklyBriefing } = await import("../../../../lib/briefing.js");
      return Response.json({ ok: true, refresh: await refreshWeeklyBriefing() });
    }
    if (params.get("briefing") === "diag") { // 브리핑 생성 원문 진단(발송 없음)
      const { generateBriefing } = await import("../../../../lib/briefing.js");
      const b = await generateBriefing({ days: Number(params.get("days")) || 7 });
      return Response.json({ from: b.from, to: b.to, count: b.count, hasHtml: !!b.html, raw: b.raw || b.html.slice(0, 400) });
    }
    if (params.get("briefing")) { // 주간 AI 브리핑 생성·발송(검토용)
      const r = await sendBriefingMail(params.get("mailto") || undefined, { days: params.get("days") });
      return Response.json({ ok: true, briefing: r });
    }
    const arch = params.get("archive"); // "html" | "zip" — 아카이브 검색 HTML 첨부 발송(전달성 테스트)
    if (arch) {
      const r = await sendArchiveMail(params.get("mailto") || undefined, { zip: arch === "zip", months: params.get("months") });
      return Response.json({ ok: true, archive: r });
    }
    if (params.get("diag") === "news") { // 소스별 수집량 점검(발송 없음)
      const { fetchIssues } = await import("../../../../lib/news.js");
      const items = await fetchIssues(30, 0);
      const byKind = {};
      items.forEach((n) => { byKind[n.kind || "?"] = (byKind[n.kind || "?"] || 0) + 1; });
      return Response.json({ total: items.length, byKind, sample: items.slice(0, 5).map((n) => `${n.source}|${n.title.slice(0, 30)}`) });
    }
    // 주간 AI 브리핑: 이번 주 것이 없으면 응답 후(after) 비동기 생성·저장 → 발송은 지연 없음
    after(async () => {
      try {
        const { isBriefingStale, refreshWeeklyBriefing } = await import("../../../../lib/briefing.js");
        if (await isBriefingStale()) await refreshWeeklyBriefing();
      } catch (e) { console.error("[briefing] after 갱신 실패:", e.message); }
    });
    const result = await collectRecent(10);
    const mailto = params.get("mailto"); // 테스트 수신자 오버라이드(있으면 항상 발송)
    const only = params.get("only"); // "issues" | "report" — 테스트 시 한 종류만 발송
    // 주말·공휴일엔 수집만 하고 발송은 생략(테스트 제외)
    if (!mailto && !isSendDay()) {
      return Response.json({ ok: true, at: new Date().toISOString(), ...result, kakao: "skip(휴일/주말)", mail: "skip(휴일/주말)" });
    }
    // 경제 이슈·규제 동향(별도 메일): 평일 09시 1회(테스트는 항상)
    const ISSUE_HOURS = [9];
    const kstHour = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
    // 카카오·거시리포트·이슈메일을 병렬 실행(60초 제한 내 처리)
    const kakaoP = only === "issues" ? Promise.resolve("skip(only=issues)") : notifyKakao().catch((e) => `error:${e.message}`);
    const mailP = only !== "issues" ? sendReportMail(mailto || undefined).catch((e) => `error:${e.message}`) : Promise.resolve("skip");
    const noAttach = params.get("noatt") === "1"; // 진단용: 첨부 없이 본문만
    const issuesP = (only !== "report" && (mailto || ISSUE_HOURS.includes(kstHour)))
      ? sendIssuesMail(mailto || undefined, { noAttach }).catch((e) => `error:${e.message}`) : Promise.resolve("skip");
    const [kakao, mail, issuesMail] = await Promise.all([kakaoP, mailP, issuesP]);
    return Response.json({ ok: true, at: new Date().toISOString(), ...result, kakao, mail, issuesMail });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// 수동 트리거(브라우저 테스트)용으로 POST도 동일 처리
export const POST = GET;

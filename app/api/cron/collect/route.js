import { collectRecent } from "../../../../lib/collectors/index.js";
import { getConfig, setConfig } from "../../../../lib/db.js";
import { refreshAccessToken, sendMemo } from "../../../../lib/kakao.js";
import { buildSummary } from "../../../../lib/summary.js";
import { sendReportMail } from "../../../../lib/mail.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const result = await collectRecent(10);
    const kakao = await notifyKakao();
    const mailto = new URL(req.url).searchParams.get("mailto"); // 테스트 수신자 오버라이드
    let mail = "skip";
    try { mail = await sendReportMail(mailto || undefined); } catch (e) { mail = `error:${e.message}`; }
    return Response.json({ ok: true, at: new Date().toISOString(), ...result, kakao, mail });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// 수동 트리거(브라우저 테스트)용으로 POST도 동일 처리
export const POST = GET;

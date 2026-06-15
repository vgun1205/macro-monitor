import { collectRecent } from "../../../../lib/collectors/index.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    return Response.json({ ok: true, at: new Date().toISOString(), ...result });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// 수동 트리거(브라우저 테스트)용으로 POST도 동일 처리
export const POST = GET;

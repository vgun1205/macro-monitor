import { exchangeCode } from "../../../../lib/kakao.js";
import { setConfig } from "../../../../lib/db.js";

export const dynamic = "force-dynamic";

const page = (title, body) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <div style="font-family:system-ui,'Malgun Gothic';max-width:560px;margin:48px auto;padding:0 20px;line-height:1.7;color:#15181E">
       <h2 style="color:#0E1726">${title}</h2>${body}</div>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );

// 카카오 동의 후 콜백 → code 교환 → 리프레시 토큰을 DB에 저장
export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err) return page("연동 취소/오류", `<p>${err}: ${url.searchParams.get("error_description") || ""}</p>`);
  if (!code) return page("오류", "<p>인가 코드(code)가 없습니다.</p>");
  try {
    const tok = await exchangeCode(code, req);
    if (!tok.refresh_token) {
      return page("토큰 발급 실패", `<pre style="white-space:pre-wrap;background:#F1F3F6;padding:12px;border-radius:8px">${JSON.stringify(tok, null, 2)}</pre>`);
    }
    await setConfig("kakao_refresh_token", tok.refresh_token);
    return page("✅ 카카오 연동 완료",
      `<p>리프레시 토큰을 저장했습니다. 이제 <b>매일 오전 9시(평일)</b> 본인 카카오톡으로 요약이 발송됩니다.</p>
       <p style="color:#5B616E;font-size:13px">이 창은 닫으셔도 됩니다. (토큰은 만료 전 자동 갱신됩니다)</p>`);
  } catch (e) {
    return page("오류", `<p>${e.message}</p>`);
  }
}

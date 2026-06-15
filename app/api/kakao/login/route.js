import { authorizeUrl } from "../../../../lib/kakao.js";

export const dynamic = "force-dynamic";

// 최초 1회: 이 주소를 브라우저로 열면 카카오 동의화면 → 콜백에서 리프레시 토큰 저장
export async function GET(req) {
  if (!process.env.KAKAO_REST_API_KEY) {
    return Response.json({ ok: false, error: "KAKAO_REST_API_KEY 미설정" }, { status: 500 });
  }
  return Response.redirect(authorizeUrl(req), 302);
}

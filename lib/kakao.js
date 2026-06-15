// 카카오톡 '나에게 보내기'(메모 API) + OAuth 토큰 관리
// 문서: https://developers.kakao.com/docs/latest/ko/message/rest-api
const REST_KEY = process.env.KAKAO_REST_API_KEY;
const CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET; // 선택(보안 사용 시)

export function redirectUri(req) {
  const base = process.env.APP_BASE_URL || new URL(req.url).origin;
  return `${base}/api/kakao/callback`;
}

export function authorizeUrl(req) {
  const p = new URLSearchParams({
    client_id: REST_KEY,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: "talk_message",
  });
  return `https://kauth.kakao.com/oauth/authorize?${p}`;
}

async function tokenRequest(params) {
  if (CLIENT_SECRET) params.set("client_secret", CLIENT_SECRET);
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  return res.json();
}

export function exchangeCode(code, req) {
  return tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: REST_KEY,
    redirect_uri: redirectUri(req),
    code,
  }));
}

export function refreshAccessToken(refreshToken) {
  return tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    client_id: REST_KEY,
    refresh_token: refreshToken,
  }));
}

// 본인 카톡으로 텍스트 메모 발송 (text 템플릿, 본문 200자 제한)
export async function sendMemo(accessToken, text, webUrl) {
  const template = {
    object_type: "text",
    text: text.slice(0, 200),
    link: { web_url: webUrl, mobile_web_url: webUrl },
    button_title: "대시보드 보기",
  };
  const res = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ template_object: JSON.stringify(template) }),
  });
  return res.json();
}

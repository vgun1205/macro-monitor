// 완성된 HTML(@page·폰트 포함) → PDF. 페이지는 CSS @page/페이지브레이크에 따름.
// 실패해도 메일은 첨부 없이 발송되도록 호출부에서 try/catch.
export async function buildPdf(fullHtml) {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle0" });
    try { await page.evaluateHandle("document.fonts.ready"); } catch {}
    // 본문 폭이 A4 가로를 넘으면 폭에 맞게 축소(메일 본문과 동일한 모양, 잘림 방지)
    const PX = 96 / 25.4;
    const availW = (297 - 16) * PX; // A4 가로 - 좌우 8mm
    const w = await page.evaluate(() => document.body.scrollWidth);
    let scale = Math.min(1, availW / w);
    scale = Math.max(0.3, Math.min(2, scale));
    const pdf = await page.pdf({
      format: "A4", landscape: true, printBackground: true, scale,
      margin: { top: "8mm", bottom: "8mm", left: "8mm", right: "8mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

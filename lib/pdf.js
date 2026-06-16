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
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

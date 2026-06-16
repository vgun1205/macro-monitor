// HTML → PDF (헤드리스 크로미움, A4 가로). 한글은 Google Fonts(Nanum Gothic) 임베드.
// 실패해도 메일은 첨부 없이 발송되도록 호출부에서 try/catch 처리.
export async function buildPdf(bodyHtml) {
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
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap');
        * { font-family: 'Nanum Gothic', sans-serif !important; }
        body { margin: 0; padding: 4px; }
      </style></head><body>${bodyHtml}</body></html>`;
    await page.setContent(html, { waitUntil: "networkidle0" });
    try { await page.evaluateHandle("document.fonts.ready"); } catch {}
    const pdf = await page.pdf({
      format: "A4", landscape: true, printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

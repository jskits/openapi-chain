// Render assets/logo/openapi-chain-social-1280x640.png, the repository social preview and the
// website's default Open Graph image. Run after changing the logo or the project summary:
//   node scripts/render-social-preview.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const logoFile = new URL('../assets/logo/openapi-chain-logo-1024.png', import.meta.url);
const output = fileURLToPath(
  new URL('../assets/logo/openapi-chain-social-1280x640.png', import.meta.url),
);
const logo = `data:image/png;base64,${readFileSync(logoFile).toString('base64')}`;

const html = `<!doctype html>
<html>
  <body style="margin:0">
    <main style="
      box-sizing:border-box;width:1280px;height:640px;padding:72px 96px;display:flex;
      align-items:center;gap:72px;background:#0B1220;color:#F8FAFC;overflow:hidden;position:relative;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
      <div style="position:absolute;inset:0;background:
        radial-gradient(520px 320px at 78% 50%,rgba(37,99,235,.35),transparent 70%),
        radial-gradient(420px 280px at 88% 55%,rgba(45,212,191,.28),transparent 70%)"></div>
      <section style="position:relative;flex:1;display:flex;flex-direction:column;gap:28px">
        <h1 style="margin:0;font-size:84px;font-weight:700;letter-spacing:-2px">openapi-chain</h1>
        <p style="margin:0;font-size:34px;line-height:1.35;color:#CBD5E1">
          Type-safe OpenAPI requests that follow your document exactly
        </p>
        <p style="margin:0;font-size:22px;color:#5EEAD4;display:flex;flex-wrap:wrap;gap:12px">
          ${['Exact wire serialization', 'Scoped generation', 'openapi-fetch adapter']
            .map(
              (item) =>
                `<span style="white-space:nowrap;padding:6px 16px;border-radius:999px;border:1px solid rgba(94,234,212,.4)">${item}</span>`,
            )
            .join('')}
        </p>
      </section>
      <img src="${logo}" alt="" style="position:relative;width:440px;height:auto" />
    </main>
  </body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: output, clip: { x: 0, y: 0, width: 1280, height: 640 } });
  console.log(`Wrote ${output}`);
} finally {
  await browser.close();
}

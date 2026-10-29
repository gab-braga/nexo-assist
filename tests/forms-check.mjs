import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(process.env.TEST_BASE_URL || "http://localhost:3000");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `artifacts/forms-${process.argv.includes("--before") ? "before" : "after"}-${width}.png`,
    });
  }
  if (!process.argv.includes("--before")) {
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page
      .getByText("Informe seu e-mail corporativo.", { exact: true })
      .waitFor();
    await page.getByText("Informe sua senha.", { exact: true }).waitFor();
    assert.equal(
      await page.locator("#email").getAttribute("aria-invalid"),
      "true",
    );
    await page.locator("#email").fill("email-invalido");
    await page.locator("#email").blur();
    await page
      .getByText("Informe um e-mail válido.", { exact: true })
      .waitFor();
    await page.locator("#email").fill("pessoa@nexo.com.br");
    await page.locator("#password").fill("senha");
    await page.getByRole("button", { name: "Mostrar senha" }).click();
    assert.equal(await page.locator("#password").getAttribute("type"), "text");
    const remember = page.getByRole("checkbox");
    assert.equal(await remember.isChecked(), true);
    await remember.uncheck();
    assert.equal(await remember.isChecked(), false);

    let release;
    const responseReady = new Promise((resolve) => {
      release = resolve;
    });
    let authRequests = 0;
    await page.route(
      "https://identitytoolkit.googleapis.com/**",
      async (route) => {
        authRequests++;
        await responseReady;
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: 400, message: "INVALID_LOGIN_CREDENTIALS" },
          }),
        });
      },
    );
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByRole("button", { name: "Entrando..." }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Entrando..." }).isDisabled(),
      true,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Esqueci minha senha" })
        .isDisabled(),
      true,
    );
    release();
    await page
      .getByRole("alert")
      .filter({ hasText: "Não foi possível entrar." })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Entrar", exact: true })
        .isEnabled(),
      true,
    );
    assert.equal(authRequests, 1);
    assert.equal(new URL(page.url()).pathname, "/");
    console.log(
      "Form validation, password visibility, remember control, pending state and authentication failure passed.",
    );
  }
} finally {
  await browser.close();
}

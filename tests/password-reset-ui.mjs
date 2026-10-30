import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:3000");
  const open = () => page.getByRole("button", { name: "Esqueci minha senha?" }).click();
  const dialog = page.getByRole("dialog", { name: "Recuperar senha" });
  const email = dialog.getByLabel("E-mail", { exact: true });
  const send = dialog.getByRole("button", { name: "Enviar link de recuperação" });
  await open();
  await send.click();
  await dialog.getByText("Informe seu e-mail corporativo.", { exact: true }).waitFor();
  await email.fill("invalido");
  await send.click();
  await dialog.getByText("Informe um e-mail válido.", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await open();
  assert.equal(await email.inputValue(), "");
  assert.equal(await dialog.getByRole("alert").count(), 0);

  let response = "success";
  let release;
  let requests = 0;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.route("https://identitytoolkit.googleapis.com/**", async (route) => {
    requests++;
    const body = route.request().postDataJSON();
    assert.equal(body.requestType, "PASSWORD_RESET");
    assert.equal(body.email, "pessoa@example.com");
    if (response === "success") await pending;
    if (response === "network") return route.abort("failed");
    await route.fulfill({
      status: response === "success" ? 200 : 400,
      contentType: "application/json",
      body: JSON.stringify(response === "success" ? {} : {
        error: { code: 400, message: response },
      }),
    });
  });
  await email.fill("pessoa@example.com");
  await send.click();
  const sending = dialog.getByRole("button", { name: "Enviando..." });
  await sending.waitFor();
  assert.equal(await sending.isDisabled(), true);
  assert.equal(await email.isDisabled(), true);
  release();
  await dialog.getByRole("status").waitFor();
  const confirmation = await dialog.getByRole("status").textContent();
  assert.match(confirmation, /Se houver uma conta/);
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await open();
  assert.equal(await dialog.getByRole("status").count(), 0);
  assert.equal(await email.inputValue(), "");

  response = "EMAIL_NOT_FOUND";
  await email.fill("pessoa@example.com");
  await send.click();
  await dialog.getByRole("status").waitFor();
  assert.equal(await dialog.getByRole("status").textContent(), confirmation);

  response = "TOO_MANY_ATTEMPTS_TRY_LATER";
  await email.fill("pessoa@example.com");
  await send.click();
  await page.getByText("Muitas solicitações. Aguarde um pouco e tente novamente.", { exact: true }).waitFor();

  response = "network";
  await send.click();
  await page.getByText("Não foi possível conectar. Verifique sua conexão e tente novamente.", { exact: true }).waitFor();

  response = "INTERNAL_ERROR";
  await send.click();
  await page.getByText("Não foi possível solicitar a recuperação. Tente novamente mais tarde.", { exact: true }).waitFor();
  assert.equal(requests, 5);
  assert.equal(await page.locator("#password").inputValue(), "");
  await page.keyboard.press("Escape");
  await open();
  assert.equal(await email.inputValue(), "");
  const bounds = await dialog.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  console.log("Password reset: validation, pending, success, privacy, errors, reset and mobile layout passed.");
} finally {
  await browser.close();
}

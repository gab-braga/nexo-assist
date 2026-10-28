import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
(async () => {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("http://localhost:3000");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "artifacts/login.png" });
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  assert.equal(await page.locator("#password").getAttribute("type"), "text");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/chat");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "artifacts/new-ticket.png" });
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .locator("#ticket-title")
    .fill("VPN não conecta no notebook — erro 809");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await page.getByText("Chamado criado", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Consultar chamados" }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "artifacts/consultation.png" });
  await page.getByRole("button", { name: "Falar com um analista" }).click();
  await page
    .getByText("Encaminhei para o Suporte N2.", { exact: false })
    .waitFor();
  await page.goto("http://localhost:3000/profile");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "artifacts/profile.png" });
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await page.getByRole("button", { name: "Link enviado" }).waitFor();
  await page.goto("http://localhost:3000/agent");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "artifacts/agent-waiting.png" });
  await page.getByRole("button", { name: "Assumir atendimento" }).click();
  await page.setViewportSize({ width: 1567, height: 900 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "artifacts/agent-assumed.png" });
  await page.getByRole("button", { name: "Enviar resposta" }).click();
  assert.equal(await page.getByLabel("Responder à conversa").inputValue(), "");
  await page
    .getByRole("button", { name: "Encerrar atendimento", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Encerrar atendimento" })
    .click();
  for (const route of ["/", "/profile", "/chat"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://localhost:3000" + route);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Overflow: " + route,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: "artifacts/mobile-" + (route.slice(1) || "login") + ".png",
    });
  }
  await page.goto("http://localhost:3000/agent");
  await page.getByRole("button", { name: /Ana Souza/ }).click();
  await page.getByRole("button", { name: "Assumir atendimento" }).click();
  assert.ok(await page.getByLabel("Responder à conversa").isVisible());
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "artifacts/mobile-agent.png" });
  await page.getByRole("button", { name: "Voltar para conversas" }).click();
  assert.ok(
    await page.getByPlaceholder("Pesquisar conversa ou chamado").isVisible(),
  );
  assert.deepEqual(errors, []);
  await browser.close();
  console.log("All interface flow checks passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

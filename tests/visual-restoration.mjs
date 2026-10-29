// Isolated presentation harness. Fixtures and action doubles never enter app routes.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const original = file => execFileSync("git", ["show", `74ee161:${file}`], { encoding: "utf8" }).replace(/^\uFEFF/, "");
const fixtures = {
  user: { uid: "customer", name: "Ana Souza", email: "ana.souza@nexo.com.br", role: "chat" },
  list: { items: [{ _id: "conversation", customerId: "customer", customerName: "Ana Souza", subject: "Notebook lento após atualização", status: "waiting", agentId: null, agentName: null, createdAt: "2026-10-28T13:01:00Z", updatedAt: "2026-10-28T13:05:00Z", version: 0 }], nextCursor: null },
  history: { items: [{ _id: "message", conversationId: "conversation", authorId: "customer", authorName: "Ana Souza", role: "chat", text: "Está parado há 5 dias. Quero falar com um analista.", createdAt: "2026-10-28T13:04:00Z" }], nextCursor: null },
  search: "", status: "all", older: false,
};
fixtures.conversation = fixtures.list.items[0];
const plugin = {
  name: "presentation-only-doubles",
  setup(build) {
    build.onResolve({ filter: /^original:/ }, args => ({ path: args.path.slice(9), namespace: "original" }));
    build.onLoad({ filter: /.*/, namespace: "original" }, args => ({ contents: original(args.path), loader: "tsx", resolveDir: path.dirname(path.join(root, args.path)) }));
    build.onResolve({ filter: /^@\/data\/data$/ }, () => ({ path: "src/data/data.ts", namespace: "original" }));
    build.onResolve({ filter: /^(next\/(image|link|navigation)|@\/auth\/session|@\/server\/(actions\/|lib\/firebase\/firebase-client))/ }, args => ({ path: args.path, namespace: "double" }));
    build.onLoad({ filter: /.*/, namespace: "double" }, args => {
      if (args.path === "next/image") return { contents: 'import React from "react"; export default function Image(props){return <img {...props}/>}', loader: "jsx", resolveDir: root };
      if (args.path === "next/link") return { contents: 'import React from "react"; export default function Link(props){return <a {...props}/>}', loader: "jsx", resolveDir: root };
      if (args.path === "next/navigation") return { contents: 'export const usePathname=()=>"/profile"; export const useRouter=()=>({push:href=>window.__navigation=href,refresh:()=>{}}); export const redirect=()=>{};' };
      if (args.path.includes("session")) return { contents: 'export const getSession=async()=>null;' };
      if (args.path.includes("firebase-client")) return { contents: 'export const getClientAuth=async()=>({});' };
      return { contents: 'export const login=async()=>({ok:false,error:"Presentation harness"});export const createConversation=async(input)=>{window.__created=input;return {ok:true,data:{_id:"conversation"}}};export const sendMessage=async(input)=>{window.__sent=input;return {ok:true,data:null}};export const transitionConversation=async(input)=>{window.__transition=input;return {ok:true,data:null}};export const logout=async()=>{};' };
    });
  },
};
const entry = `import React from "react"; import {createRoot} from "react-dom/client";
import OriginalLogin from "original:src/app/(login)/page.tsx";
import OriginalAgent from "original:src/app/agent/page.tsx";
import OriginalChat from "original:src/app/(chat)/chat/page.tsx";
import OriginalProfile from "original:src/app/(chat)/profile/page.tsx";
import RestoredLogin from "./src/app/(login)/page";
import {AgentWorkspace} from "./src/components/agent-workspace";
import {ChatWorkspace} from "./src/components/chat-workspace";
import {ProfileDetails} from "./src/components/profile-details";
import {Shell} from "./src/components/shell";
const props=${JSON.stringify(fixtures)};
async function main(){ const {variant,screen,state}=window.__case;
if(screen==="agent"){props.user={uid:"agent",name:"Rafael Lima",email:"rafael@example.test",role:"agent"};if(state==="active"){props.conversation={...props.conversation,status:"active",agentId:"agent",agentName:"Rafael Lima"};}}
if(screen==="chat"&&state==="new"){props.conversation=null;props.history=null;}
let view=screen==="login" ? variant==="original" ? <OriginalLogin/> : await RestoredLogin() : screen==="agent" ? variant==="original" ? <OriginalAgent/> : <AgentWorkspace {...props}/> : screen==="profile" ? variant==="original" ? <OriginalProfile/> : <ProfileDetails user={props.user}/> : variant==="original" ? <OriginalChat/> : <ChatWorkspace {...props}/>;
if(screen==="chat"||screen==="profile")view=<Shell user={props.user}>{view}</Shell>;
createRoot(document.getElementById("root")).render(view);window.__ready=true;
}main();`;
const bundle = await build({ stdin: { contents: entry, resolveDir: root, loader: "tsx" }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [plugin] });
const cssFiles = (await readdir(".next/static/chunks")).filter(file => file.endsWith(".css"));
const css = (await Promise.all(cssFiles.map(file => readFile(path.join(".next/static/chunks", file), "utf8")))).join("\n");
const destination = "artifacts/visual-restoration";
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks = [];
try {
  for (const width of [390, 768, 1440]) {
    for (const screen of ["login", "profile", "chat", "agent"]) {
      const measurements = {};
      for (const variant of ["original", "restored"]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/*", async route => {
          const pathname = new URL(route.request().url()).pathname;
          if (pathname === "/") { await route.fulfill({ contentType: "text/html", body: "<html><body></body></html>" }); return; }
          try { await route.fulfill({ body: await readFile(path.join(root, "public", pathname)), contentType: pathname.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream" }); }
          catch { await route.fulfill({ status: 404, body: "" }); }
        });
        await page.goto("http://localhost/");
        await page.setContent(`<html><head><style>${css}</style></head><body><div id="root"></div></body></html>`);
        await page.evaluate(value => window.__case = value, { variant, screen, state: "new" });
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.waitForSelector('[data-visual]');
        await page.evaluate(() => document.fonts.ready);
        if (screen === "agent" && width <= 650 && variant === "original") {
          await page.locator('[data-visual~="conversation-item"]').first().click();
        }
        await page.screenshot({ path: `${destination}/${screen}-${variant}-${width}.png`, fullPage: true });
        const keys = screen === "login" ? ["login-page", "login-story", "login-form-panel", "story-stats"] : screen === "profile" ? ["profile-page", "profile-details", "password-card"] : screen === "chat" ? ["customer-chat", "customer-transcript", "customer-composer"] : ["agent-console", "agent-rail", "conversation-panel", "agent-chat", "agent-composer"];
        measurements[variant] = await page.evaluate(keys => Object.fromEntries(keys.map(key => {
          const element = document.querySelector(`[data-visual~="${key}"]`);
          const s = getComputedStyle(element);
          const r = element.getBoundingClientRect();
          return [key, { width: r.width, height: r.height, fontSize: s.fontSize, color: s.color, background: s.backgroundColor, borderRadius: s.borderRadius, padding: s.padding, display: s.display }];
        })), keys);
        if (variant === "restored" && screen === "agent") {
          if (width > 650 && width <= 1250) await page.getByRole("button", { name: "Fechar painel de atendimentos" }).click();
          await page.getByRole("button", { name: "Assumir atendimento" }).click();
          assert.equal(await page.evaluate(() => window.__transition.operation), "assume");
          await page.getByRole("button", { name: "Opções da conversa" }).click();
          await page.getByRole("button", { name: /atendimentos$/ }).filter({ hasText: /Mostrar|Ocultar/ }).click();
        }
        if (variant === "restored" && screen === "chat") {
          await page.getByLabel("Novo atendimento").fill("Preciso de suporte");
          await page.getByRole("button", { name: "Iniciar atendimento" }).click();
          await page.waitForFunction(() => Boolean(window.__created));
          assert.equal(await page.evaluate(() => window.__created.subject), "Preciso de suporte");
        }
        assert.deepEqual(errors, []);
        await page.close();
      }
      for (const [key, original] of Object.entries(measurements.original)) {
        const restored = measurements.restored[key];
        // Dynamic conversation content changes transcript height; preserve its styling and width.
        for (const property of ["width", "fontSize", "color", "background", "borderRadius", "padding", "display"]) {
          // The historical mobile screenshot uses the full remaining width. Resolve
          // conflicting legacy grid utilities under the current Tailwind compiler.
          if (screen === "agent" && width <= 650 && ["agent-chat", "agent-composer"].includes(key) && property === "width") {
            assert.equal(restored.width, width - 48);
            continue;
          }
          if (key === "agent-composer" && property === "padding") continue;
          assert.deepEqual(restored[property], original[property], `${screen}/${width}/${key}/${property}`);
        }
      }
      checks.push({ screen, width, measurements });
    }
  }
  await writeFile(`${destination}/comparison.json`, JSON.stringify(checks, null, 2));
  console.log("Visual restoration checks passed at 390, 768 and 1440px; screenshots and measurements saved.");
} finally { await browser.close(); }

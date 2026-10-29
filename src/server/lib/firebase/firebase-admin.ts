import "server-only";
import {
  cert,
  getApps,
  initializeApp,
  applicationDefault,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function getAdminApp() {
  const existing = getApps().find((app) => app.name === "nexo-server");
  if (existing) return existing;

  const file =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    resolve("service-account.json");

  const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    : existsSync(/* turbopackIgnore: true */ file)
      ? cert(JSON.parse(readFileSync(/* turbopackIgnore: true */ file, "utf8")))
      : applicationDefault();

  return initializeApp(
    { credential, projectId: process.env.FIREBASE_PROJECT_ID },
    "nexo-server",
  );
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

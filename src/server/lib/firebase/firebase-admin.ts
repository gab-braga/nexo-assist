import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getServiceAccount } from "./service-account.mjs";

function getAdminApp() {
  const existing = getApps().find((app) => app.name === "nexo-server");
  if (existing) return existing;

  const account = getServiceAccount();
  let credential;
  try {
    credential = cert(account);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT contains invalid service account credentials.",
    );
  }

  return initializeApp(
    { credential, projectId: process.env.FIREBASE_PROJECT_ID },
    "nexo-server",
  );
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

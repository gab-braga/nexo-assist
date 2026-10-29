import { readFile } from "node:fs/promises";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Trusted administrative CLI. Deliberately not exposed as a Server Action.
async function main() {
  const [uid, role] = process.argv.slice(2);
  if (!uid || !["chat", "agent", "remove"].includes(role)) {
    throw new Error(
      "Usage: npm run auth:role -- FIREBASE_UID chat|agent|remove",
    );
  }
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  else {
    try {
      credential = cert(
        JSON.parse(
          await readFile(
            process.env.GOOGLE_APPLICATION_CREDENTIALS ||
              "service-account.json",
            "utf8",
          ),
        ),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      credential = applicationDefault();
    }
  }
  const auth = getAuth(initializeApp({ credential }));
  const user = await auth.getUser(uid);
  const claims = { ...user.customClaims };
  if (role === "remove") delete claims.role;
  else claims.role = role;
  // Revoke before and after the change so a stale session cannot retain access.
  await auth.revokeRefreshTokens(uid);
  await auth.setCustomUserClaims(uid, claims);
  await auth.revokeRefreshTokens(uid);
  console.log("Role updated. The user must sign in again.");
}
main().catch((error) => {
  // Admin SDK exceptions may include credentials in their nested request data.
  console.error("Role update failed:", error.code || error.message);
  process.exitCode = 1;
});

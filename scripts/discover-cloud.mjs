import { readFile, writeFile } from "node:fs/promises";
import { createSign } from "node:crypto";

// Read-only discovery. Never print private keys, OAuth tokens or connection secrets.
const account = JSON.parse(
  await readFile(
    process.env.GOOGLE_APPLICATION_CREDENTIALS || "service-account.json",
    "utf8",
  ),
);
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const payload = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
  iss: account.client_email,
  scope:
    "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase",
  aud: "https://oauth2.googleapis.com/token",
  iat: now,
  exp: now + 3600,
})}`;
const signature = createSign("RSA-SHA256")
  .update(payload)
  .sign(account.private_key, "base64url");
const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${payload}.${signature}`,
  }),
});
const token = await response.json();
if (!response.ok)
  throw new Error(`Credential exchange failed (${response.status})`);
async function get(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      `Cloud API failed (${response.status}): ${body.error?.message || "unknown"}`,
    );
  return body;
}
const project = account.project_id;
const databases = await get(
  `https://firestore.googleapis.com/v1/projects/${project}/databases`,
);
console.log(
  "Databases:",
  JSON.stringify(
    databases.databases?.map(
      ({
        name,
        uid,
        locationId,
        type,
        databaseEdition,
        mongodbCompatibleDataAccessMode,
      }) => ({
        name,
        uid,
        locationId,
        type,
        databaseEdition,
        mongodbCompatibleDataAccessMode,
      }),
    ),
  ),
);
let apps = await get(
  `https://firebase.googleapis.com/v1beta1/projects/${project}/webApps`,
);
if (!apps.apps?.length && process.argv.includes("--configure")) {
  let operation = await get(
    `https://firebase.googleapis.com/v1beta1/projects/${project}/webApps`,
    {
      method: "POST",
      body: JSON.stringify({ displayName: "Nexo Assist Web" }),
    },
  );
  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    operation = await get(
      `https://firebase.googleapis.com/v1beta1/${operation.name}`,
    );
  }
  if (operation.error) throw new Error("Web app creation failed");
  apps = await get(
    `https://firebase.googleapis.com/v1beta1/projects/${project}/webApps`,
  );
}
console.log(
  "Web apps:",
  JSON.stringify(
    apps.apps?.map(({ name, displayName }) => ({ name, displayName })),
  ),
);
let auth;
try {
  auth = await get(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,
  );
} catch (error) {
  if (
    !process.argv.includes("--configure") ||
    !error.message.includes("CONFIGURATION_NOT_FOUND")
  )
    throw error;
  try {
    await get(
      `https://identitytoolkit.googleapis.com/v2/projects/${project}/identityPlatform:initializeAuth`,
      { method: "POST", body: "{}" },
    );
    auth = await get(
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,
    );
  } catch (initializationError) {
    console.log("Authentication setup pending:", initializationError.message);
    auth = {};
  }
}
if (
  auth.name &&
  !auth.signIn?.email?.enabled &&
  process.argv.includes("--configure")
) {
  auth = await get(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`,
    {
      method: "PATCH",
      body: JSON.stringify({
        signIn: { email: { enabled: true, passwordRequired: true } },
      }),
    },
  );
}
console.log("Email/password enabled:", auth.signIn?.email?.enabled === true);
const db = databases.databases?.find(
  (db) => db.type === "FIRESTORE_NATIVE" && db.databaseEdition === "ENTERPRISE",
);
if (!db || !apps.apps?.length)
  throw new Error(
    "Enterprise database or Firebase web app not found; no local environment written.",
  );
const config = await get(
  `https://firebase.googleapis.com/v1beta1/${apps.apps[0].name}/config`,
);
const databaseId = db.name.split("/").at(-1);
const env = {
  FIREBASE_PROJECT_ID: project,
  GOOGLE_APPLICATION_CREDENTIALS: "./service-account.json",
  MONGODB_DATABASE: databaseId,
  MONGODB_URI: `mongodb://${db.uid}.${db.locationId}.firestore.goog:443/${databaseId}?loadBalanced=true&tls=true&retryWrites=false&authMechanism=MONGODB-OIDC`,
  NEXT_PUBLIC_FIREBASE_API_KEY: config.apiKey,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: config.authDomain,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: config.projectId,
  NEXT_PUBLIC_FIREBASE_APP_ID: config.appId,
};
try {
  await readFile(".env.local");
  throw new Error(
    "Existing .env.local preserved. Merge configuration manually.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await writeFile(
  ".env.local",
  Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n",
  { flag: "wx" },
);
console.log("Local environment configured (values omitted).");

// Used only by server modules and trusted administrative CLIs.
export function getServiceAccount() {
  const value = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!value?.trim()) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is required. Configure it in .env.local or the server environment.",
    );
  }

  let account;
  try {
    account = JSON.parse(value);
  } catch {
    // JSON parser errors can contain fragments of the private key.
    throw new Error("FIREBASE_SERVICE_ACCOUNT must contain valid JSON.");
  }

  if (
    !account ||
    account.type !== "service_account" ||
    ["project_id", "client_email", "private_key"].some(
      (field) => typeof account[field] !== "string" || !account[field].trim(),
    )
  ) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT must contain a service account with project_id, client_email and private_key.",
    );
  }
  return account;
}

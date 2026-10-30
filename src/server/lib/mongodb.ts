import "server-only";
import { MongoClient } from "mongodb";
import { GoogleAuth } from "google-auth-library";
import { getServiceAccount } from "./firebase/service-account.mjs";

const state = globalThis as typeof globalThis & {
  nexoMongo?: Promise<MongoClient>;
};

export async function database() {
  if (!state.nexoMongo) {
    const uri = process.env.MONGODB_URI;
    const name = process.env.MONGODB_DATABASE;
    if (!uri || !name) throw new Error("Missing database configuration");
    const connection = new URL(uri);
    connection.searchParams.set("loadBalanced", "true");
    connection.searchParams.set("tls", "true");
    connection.searchParams.set("retryWrites", "false");
    connection.searchParams.set("authSource", "$external");
    const auth = new GoogleAuth({
      credentials: getServiceAccount(),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });

    const client = new MongoClient(connection.toString(), {
      tls: true,
      retryWrites: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      authMechanism: "MONGODB-OIDC",
      authMechanismProperties: {
        ALLOWED_HOSTS: [connection.hostname],
        OIDC_CALLBACK: async () => {
          const token = await auth.getAccessToken();
          if (!token) throw new Error("Missing database access token");
          return { accessToken: token, expiresInSeconds: 300 };
        },
      },
    });

    state.nexoMongo = client.connect().catch(async (error) => {
      state.nexoMongo = undefined;
      await client.close();
      throw error;
    });
  }

  return (await state.nexoMongo).db(process.env.MONGODB_DATABASE);
}

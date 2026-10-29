"use client";
import { getApp, getApps, initializeApp } from "firebase/app";
import { initializeAuth, inMemoryPersistence, type Auth } from "firebase/auth";

let auth: Auth | undefined;

export async function getClientAuth() {
  if (auth) return auth;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("Firebase não configurado.");
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });
  auth = initializeAuth(app, { persistence: inMemoryPersistence });
  return auth;
}

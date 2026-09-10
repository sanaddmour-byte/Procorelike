import jwt from "jsonwebtoken";
import type { AccessTokenClaims } from "@siteops/shared";
import type { Env } from "../env";

export function signAccessToken(env: Env, claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
}

export function verifyAccessToken(env: Env, token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded === "string") {
    throw new Error("Malformed access token payload");
  }
  const { sub, email } = decoded;
  if (typeof sub !== "string" || typeof email !== "string") {
    throw new Error("Malformed access token payload");
  }
  return { sub, email };
}

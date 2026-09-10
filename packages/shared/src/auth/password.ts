import { hash, verify } from "@node-rs/argon2";

/** argon2id password hashing (prebuilt native binding — no local toolchain needed). */
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

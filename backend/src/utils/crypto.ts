import crypto from "crypto";

const API_KEY_BYTES = 32;
const HASH_ALGO = "sha256";

export function generateApiKey(): string {
  return crypto.randomBytes(API_KEY_BYTES).toString("hex");
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash(HASH_ALGO).update(apiKey, "utf8").digest("hex");
}

export function verifyApiKey(plain: string, hash: string): boolean {
  return crypto.timingSafeEqual(
    Buffer.from(hashApiKey(plain), "hex"),
    Buffer.from(hash, "hex")
  );
}

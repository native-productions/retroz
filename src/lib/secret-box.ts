import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Symmetric encryption for provider API keys at rest.
 *
 * The other integration keys on AppSetting (Pexels, Tavily) are stored in the
 * clear because leaking one costs nothing. An LLM provider key bills real money,
 * so it never touches the database in plaintext.
 *
 * Format: `v1:<iv>:<authTag>:<ciphertext>`, every part base64url.
 */

const VERSION = "v1";
const IV_BYTES = 12; // GCM standard nonce length.

function secret(): Buffer {
  // A dedicated key is preferred, but the app already ships with an Auth.js
  // secret of the same sensitivity, so fall back to it rather than making every
  // existing install edit .env before the settings page will load.
  const raw = process.env.RETROZ_SECRET_KEY || process.env.AUTH_SECRET;
  if (!raw) {
    throw new Error(
      "Cannot encrypt provider keys: set RETROZ_SECRET_KEY (or AUTH_SECRET) in .env.",
    );
  }
  // Widen whatever length the operator chose to the 32 bytes AES-256 needs.
  return createHash("sha256").update(raw).digest();
}

/** True when a key is configured, so callers can fail loudly before writing. */
export function isSecretBoxConfigured(): boolean {
  return Boolean(process.env.RETROZ_SECRET_KEY || process.env.AUTH_SECRET);
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

/**
 * Reverse of `encryptSecret`. Throws when the payload is malformed or the
 * secret changed — a rotated RETROZ_SECRET_KEY invalidates every stored key,
 * which the settings page reports as "re-enter your API key".
 */
export function decryptSecret(stored: string): string {
  if (!stored) return "";
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Stored secret is not in the expected format.");
  }
  const [, iv, authTag, ciphertext] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secret(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Decrypt without throwing — used where a bad key should disable a feature. */
export function tryDecryptSecret(stored: string): string | null {
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}

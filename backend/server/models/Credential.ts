import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";
import { JWT_SECRET } from "../config/secrets";

/**
 * CR 263 (2026-09-22): the logins for the websites the team uses, kept on the Classified Documents
 * page. Reaching any of this needs the classified PIN, exactly like the classified files.
 *
 * The password is encrypted at rest (AES-256-GCM) with a key derived from the server secret, so a
 * copy of the database alone does not hand over the passwords. It is decrypted only when someone
 * who may see the entry opens it.
 */

const KEY = crypto.scryptSync(JWT_SECRET, "gt-credentials-v1", 32);

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(stored: string): string {
  if (!stored) return "";
  try {
    const [iv, tag, data] = String(stored).split(".");
    if (!iv || !tag || !data) return "";
    const d = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return "";   // a secret encrypted under an older server secret: shown as empty, never throws
  }
}

export interface ICredential extends Document {
  platform: string;        // "AWS", "USACE portal"...
  url: string;
  username: string;
  password: string;        // encrypted (see above)
  hint: string;
  notes: string;
  ownerId: string;         // who created it
  ownerName: string;
  sharedWith: string[];    // user ids who may also open it
  createdAt: Date;
  updatedAt: Date;
}

const CredentialSchema = new Schema<ICredential>(
  {
    platform: { type: String, default: "", index: true },
    url: { type: String, default: "" },
    username: { type: String, default: "" },
    password: { type: String, default: "" },
    hint: { type: String, default: "" },
    notes: { type: String, default: "" },
    ownerId: { type: String, default: "", index: true },
    ownerName: { type: String, default: "" },
    sharedWith: { type: [String], default: [], index: true },
  },
  { timestamps: true }
);

export default mongoose.model<ICredential>("Credential", CredentialSchema);

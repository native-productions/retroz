import fs from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { contentTypeFor } from "@/lib/mime";
import { publicUrlFor } from "./config";
import { normalizeKey, type PutOptions, type Storage, type StorageObject } from "./types";

/** How many objects to transfer at once during directory hydrate/upload. */
const TRANSFER_CONCURRENCY = 8;
/** S3 caps a single DeleteObjects request at 1000 keys. */
const DELETE_BATCH = 1000;

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * Driver for any S3-compatible object store: Cloudflare R2 in production,
 * MinIO for local testing. Only the endpoint and addressing style differ.
 *
 * Object stores have no directories, so `ensurePrefix` is a no-op — folder
 * existence is tracked by database rows. The `hydrate*` methods materialize
 * objects on local disk, which the agent and Playwright need since they work
 * with real file paths and `file://` URLs.
 */
export class S3Storage implements Storage {
  readonly name = "s3" as const;

  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer, opts?: PutOptions): Promise<void> {
    const k = normalizeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: k,
        Body: body,
        ContentType: opts?.contentType ?? contentTypeFor(k),
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: normalizeKey(key) }),
    );
    if (!res.Body) throw new Error(`Empty body for ${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: normalizeKey(key) }),
      );
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    // S3 delete is already idempotent — a missing key is not an error.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: normalizeKey(key) }),
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    const objects = await this.list(prefix);
    for (let i = 0; i < objects.length; i += DELETE_BATCH) {
      const batch = objects.slice(i, i + DELETE_BATCH);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((o) => ({ Key: o.key })), Quiet: true },
        }),
      );
    }
  }

  async list(prefix: string): Promise<StorageObject[]> {
    // Trailing slash so "data/fonts/inter" cannot match "data/fonts/inter-tight".
    const base = normalizeKey(prefix);
    const search = base ? `${base}/` : "";
    const out: StorageObject[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: search,
          ContinuationToken: token,
        }),
      );
      for (const o of res.Contents ?? []) {
        if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0 });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const from = normalizeKey(fromKey);
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: normalizeKey(toKey),
        CopySource: encodeSource(this.bucket, from),
        ContentType: contentTypeFor(toKey),
        MetadataDirective: "REPLACE",
      }),
    );
    await this.delete(from);
  }

  async ensurePrefix(_prefix: string): Promise<void> {
    // No-op: object stores have no directories.
  }

  publicUrl(key: string): string {
    return publicUrlFor(normalizeKey(key));
  }

  async hydrate(key: string, destAbs: string): Promise<string> {
    const buf = await this.get(key);
    await fs.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.writeFile(destAbs, buf);
    return destAbs;
  }

  async hydratePrefix(prefix: string, destDirAbs: string): Promise<string> {
    await fs.mkdir(destDirAbs, { recursive: true });
    const base = normalizeKey(prefix);
    const objects = await this.list(base);
    await mapLimit(objects, TRANSFER_CONCURRENCY, async (o) => {
      const rel = o.key.slice(base.length + 1); // +1 drops the separator
      if (!rel) return;
      await this.hydrate(o.key, path.join(destDirAbs, ...rel.split("/")));
    });
    return destDirAbs;
  }

  async putDir(srcDirAbs: string, prefix: string): Promise<void> {
    const base = normalizeKey(prefix);
    const files = await walkFiles(srcDirAbs);
    await mapLimit(files, TRANSFER_CONCURRENCY, async (rel) => {
      const buf = await fs.readFile(path.join(srcDirAbs, rel));
      await this.put(`${base}/${rel.split(path.sep).join("/")}`, buf);
    });
  }
}

/** S3 CopySource is a path, so each key segment needs URL-encoding. */
function encodeSource(bucket: string, key: string): string {
  return `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
}

/** Directory-relative paths of every file under a directory, recursively. */
async function walkFiles(dirAbs: string, rel = ""): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(path.join(dirAbs, rel), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const childRel = rel ? path.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(dirAbs, childRel)));
    } else if (entry.isFile()) {
      out.push(childRel);
    }
  }
  return out;
}

/** Run an async mapper over items, at most `limit` in flight. */
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      await fn(items[cursor++]);
    }
  });
  await Promise.all(workers);
}

/**
 * Stamp `Cache-Control: no-cache` onto objects uploaded before the driver set it.
 *
 *   bun run storage:recache            # dry run — counts what it would rewrite
 *   bun run storage:recache -- --apply # rewrite the metadata
 *
 * Every key here is mutable: re-rendering a slide replaces the object at the same
 * key, so the browser — which reads bucket URLs directly — must revalidate rather
 * than trust a cached copy. Objects written before `s3-driver.ts` set the header
 * carry none at all, which lets a browser cache them heuristically and keep
 * showing the pre-revision image.
 *
 * The rewrite is a server-side copy onto the same key with REPLACE metadata: the
 * bytes never travel, and an interrupted run simply leaves the remaining objects
 * on their old headers. Local-driver installs have nothing to do — that path is
 * served by `/api/media`, which already sends `no-store`.
 */
import {
  CopyObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { storage } from "@/lib/storage";
import { contentTypeFor } from "@/lib/mime";

const apply = process.argv.includes("--apply");
const CACHE_CONTROL = "no-cache";
/** Matches the driver's transfer concurrency; MinIO and R2 both cope with this. */
const CONCURRENCY = 8;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  if (storage.name !== "s3") {
    console.log(
      `driver: ${storage.name} — nothing to do (the local driver serves through ` +
        "/api/media, which already sends no-store).",
    );
    return;
  }

  const bucket = required("S3_BUCKET");
  const client = new S3Client({
    endpoint: required("S3_ENDPOINT"),
    region: process.env.S3_REGION ?? "auto",
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  });

  const objects = await storage.list("data");
  console.log(`bucket: ${bucket}`);
  console.log(`objects: ${objects.length}`);
  console.log(apply ? "mode: APPLY\n" : "mode: dry run (pass --apply to execute)\n");

  let stamped = 0;
  let alreadySet = 0;
  let failed = 0;

  const queue = [...objects];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let next = queue.pop(); next; next = queue.pop()) {
        const key = next.key;
        try {
          const head = await client.send(
            new HeadObjectCommand({ Bucket: bucket, Key: key }),
          );
          if (head.CacheControl === CACHE_CONTROL) {
            alreadySet += 1;
            continue;
          }
          stamped += 1;
          if (!apply) continue;
          await client.send(
            new CopyObjectCommand({
              Bucket: bucket,
              Key: key,
              CopySource: `${bucket}/${key}`.split("/").map(encodeURIComponent).join("/"),
              ContentType: head.ContentType ?? contentTypeFor(key),
              CacheControl: CACHE_CONTROL,
              MetadataDirective: "REPLACE",
            }),
          );
        } catch (err) {
          failed += 1;
          console.warn(`  ! ${key}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }),
  );

  console.log(`\n${apply ? "stamped" : "would stamp"}: ${stamped}`);
  console.log(`already correct: ${alreadySet}`);
  if (failed > 0) console.log(`failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

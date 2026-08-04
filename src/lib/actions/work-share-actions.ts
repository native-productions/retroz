"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "@/lib/db-client";
import { DATA_ROOT, slugify } from "@/lib/paths";
import { storage } from "@/lib/storage";
import {
  lanHosts,
  newShareToken,
  qrSvg,
  shareUrl,
} from "@/lib/bundle-share";

const run = promisify(execFile);

// The three ways a finished bundle leaves this machine for a phone:
// a LAN link (QR), the macOS share sheet (AirDrop), and a zip. Only the first
// two need server work — the zip route already exists.

export interface BundleShareState {
  /** Null until a link has been issued. */
  token: string | null;
  /** Every LAN address the phone might reach this machine at, best first. */
  hosts: string[];
  /** `http://<host>:<port>/s/<token>` for the currently selected host. */
  url: string | null;
  /** Inline SVG of `url`, or null when there is no link yet. */
  qr: string | null;
  /** True on macOS, where staging files for AirDrop can open Finder. */
  canReveal: boolean;
}

function state(token: string | null, host?: string): BundleShareState {
  const hosts = lanHosts();
  const chosen = host && hosts.includes(host) ? host : hosts[0];
  const url = token && chosen ? shareUrl(chosen, token) : null;
  return {
    token,
    hosts,
    url,
    qr: url ? qrSvg(url) : null,
    canReveal: process.platform === "darwin",
  };
}

/** Current share state, without issuing anything — the dialog's first read. */
export async function getBundleShare(
  bundleId: string,
  host?: string,
): Promise<BundleShareState> {
  const bundle = await db.workBundle.findUnique({
    where: { id: bundleId },
    select: { shareToken: true },
  });
  return state(bundle?.shareToken ?? null, host);
}

/**
 * Issue a link, or re-read the existing one. A bundle holds a single token, so
 * this is idempotent: re-opening the dialog does not invalidate the QR code
 * already sitting on someone's phone.
 */
export async function createBundleShare(
  bundleId: string,
  host?: string,
): Promise<BundleShareState> {
  const existing = await db.workBundle.findUnique({
    where: { id: bundleId },
    select: { shareToken: true },
  });
  if (!existing) throw new Error("That bundle no longer exists.");
  if (existing.shareToken) return state(existing.shareToken, host);

  const token = newShareToken();
  await db.workBundle.update({
    where: { id: bundleId },
    data: { shareToken: token, sharedAt: new Date() },
  });
  return state(token, host);
}

/** Kill the link. The next scan of an old QR code gets a 404. */
export async function revokeBundleShare(
  bundleId: string,
): Promise<BundleShareState> {
  await db.workBundle.update({
    where: { id: bundleId },
    data: { shareToken: null, sharedAt: null },
  });
  return state(null);
}

/** Swap which LAN address the QR points at, without touching the token. */
export async function reissueBundleShareUrl(
  bundleId: string,
  host: string,
): Promise<BundleShareState> {
  return getBundleShare(bundleId, host);
}

export interface RevealResult {
  /** Absolute folder the numbered PNGs were written to. */
  folder: string;
  count: number;
  /** False when the platform has no Finder to open — the path still stands. */
  opened: boolean;
}

/**
 * Stage the slides as numbered PNGs in a folder and open it in Finder, so the
 * whole carousel can be selected and AirDropped in one gesture.
 *
 * AirDrop itself is not scriptable — this gets the files one right-click away,
 * which is as far as macOS allows an app that is not the Finder to go.
 */
export async function revealBundleForAirdrop(
  bundleId: string,
): Promise<RevealResult> {
  const bundle = await db.workBundle.findUnique({
    where: { id: bundleId },
    select: {
      name: true,
      items: {
        orderBy: { order: "asc" },
        select: { artifact: { select: { filename: true, relPath: true } } },
      },
    },
  });
  if (!bundle) throw new Error("That bundle no longer exists.");
  if (bundle.items.length === 0) throw new Error("This bundle has no slides yet.");

  const folder = path.join(
    DATA_ROOT,
    "share",
    slugify(bundle.name) || `bundle-${bundleId}`,
  );
  // Rewritten from scratch every time: a slide removed since the last AirDrop
  // must not still be sitting in the folder waiting to be sent.
  await fs.rm(folder, { recursive: true, force: true });
  await fs.mkdir(folder, { recursive: true });

  const pad = Math.max(2, String(bundle.items.length).length);
  let count = 0;

  for (const [i, item] of bundle.items.entries()) {
    const prefix = String(i + 1).padStart(pad, "0");
    try {
      const buffer = await storage.get(item.artifact.relPath);
      await fs.writeFile(
        path.join(folder, `${prefix}-${item.artifact.filename}`),
        buffer,
      );
      count += 1;
    } catch {
      // A slide whose file has gone missing should not sink the whole export.
    }
  }

  if (count === 0) throw new Error("None of this bundle's files could be read.");

  let opened = false;
  if (process.platform === "darwin") {
    try {
      await run("open", [folder]);
      opened = true;
    } catch {
      // Finder refused to open — the caller shows the path to open by hand.
    }
  }

  return { folder, count, opened };
}

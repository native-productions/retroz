import { networkInterfaces } from "node:os";
import { randomBytes } from "node:crypto";
import qrcode from "qrcode-generator";
import { db } from "@/lib/db-client";

// Getting a finished carousel onto the phone is the last mile of this app: the
// renders live on a laptop, Instagram only uploads from a phone. The share link
// is that bridge — a page served off the same LAN, reachable by scanning a QR
// code, with no login on the phone. The token in the URL is the only credential,
// so it is long, random, single-valued (issuing a new one revokes the old), and
// scoped to exactly one bundle's slides.

/** Port the dev/prod server listens on — the share URL has to name it. */
const PORT = process.env.PORT ?? "3020";

/** 32 hex chars: far past guessing range for a link that lives on a home LAN. */
export function newShareToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Every LAN address this machine can be reached at, best candidate first.
 *
 * A laptop usually has several (Wi-Fi, Ethernet, Docker bridges, VPN); the phone
 * can only reach the one on its own network, so the UI offers the list rather
 * than guessing. Private ranges are ranked above everything else because that is
 * where a phone on the same Wi-Fi will be.
 */
export function lanHosts(): string[] {
  const found: { address: string; rank: number }[] = [];

  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const net of addresses ?? []) {
      // `family` is "IPv4" on Node 18+, 4 on older typings.
      const isV4 = net.family === "IPv4" || (net.family as unknown) === 4;
      if (!isV4 || net.internal) continue;
      found.push({
        address: net.address,
        // Interface first, address second: a laptop running VMs has private
        // addresses on bridges no phone can see, and those look identical to
        // the Wi-Fi one by range alone.
        rank: rankInterface(name) * 10 + rankAddress(net.address),
      });
    }
  }

  return found
    .sort((a, b) => a.rank - b.rank || a.address.localeCompare(b.address))
    .map((n) => n.address);
}

/** Lower sorts first: real hardware ports before virtual bridges and tunnels. */
function rankInterface(name: string): number {
  if (name === "en0") return 0; // Wi-Fi on macOS
  if (/^(en|eth|wl)\d/.test(name)) return 1;
  if (/^(bridge|utun|vmnet|vnic|tap|tun|docker|veth|awdl|llw)/.test(name)) {
    return 3;
  }
  return 2;
}

/** Lower sorts first: home Wi-Fi ranges before link-local leftovers. */
function rankAddress(address: string): number {
  if (address.startsWith("169.254.")) return 4; // self-assigned, routes nowhere
  if (address.startsWith("192.168.")) return 0;
  if (address.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return 3;
}

/** The URL to put on the phone: `http://<lan-ip>:<port>/s/<token>`. */
export function shareUrl(host: string, token: string): string {
  return `http://${host}:${PORT}/s/${token}`;
}

/**
 * QR as an inline SVG string.
 *
 * Error-correction level M with a quiet margin: it has to survive being read off
 * a screen at an angle, which is the only way this code is ever scanned.
 */
export function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export interface SharedSlide {
  id: string;
  filename: string;
  /** Token-scoped URL — the phone has no session to read `/api/media` with. */
  url: string;
  width: number | null;
  height: number | null;
}

export interface SharedBundle {
  id: string;
  name: string;
  token: string;
  slides: SharedSlide[];
  /** Zip of every slide, numbered in carousel order. */
  downloadUrl: string;
}

/**
 * Resolve a share token into the bundle behind it. The token is the whole
 * authorisation check — an unknown one is a 404, never a hint that it expired.
 */
export async function getSharedBundle(
  token: string,
): Promise<SharedBundle | null> {
  if (!token) return null;

  const bundle = await db.workBundle.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      name: true,
      items: {
        orderBy: { order: "asc" },
        select: {
          artifact: {
            select: { id: true, filename: true, width: true, height: true },
          },
        },
      },
    },
  });
  if (!bundle) return null;

  return {
    id: bundle.id,
    name: bundle.name,
    token,
    slides: bundle.items.map((item) => ({
      id: item.artifact.id,
      filename: item.artifact.filename,
      url: `/api/share/${token}/slide/${item.artifact.id}`,
      width: item.artifact.width,
      height: item.artifact.height,
    })),
    downloadUrl: `/api/share/${token}/download`,
  };
}

/**
 * The stored path of one slide, but only if it really belongs to the bundle the
 * token opens. Without this check a token would read any artifact id posted at
 * it.
 */
export async function sharedSlidePath(
  token: string,
  artifactId: string,
): Promise<{ relPath: string; filename: string } | null> {
  const item = await db.workBundleItem.findFirst({
    where: { artifactId, bundle: { shareToken: token } },
    select: { artifact: { select: { relPath: true, filename: true } } },
  });
  return item?.artifact ?? null;
}

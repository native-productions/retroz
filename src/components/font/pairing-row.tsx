"use client";

import { useRouter } from "next/navigation";
import { Trash2, ArrowRight } from "lucide-react";
import { deletePairing } from "@/lib/actions/font-actions";

export function PairingRow({
  pairing,
}: {
  pairing: {
    id: string;
    name: string;
    heading: string;
    body: string;
    moodTags: string;
  };
}) {
  const router = useRouter();
  return (
    <div className="retro-card flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="font-display font-semibold">{pairing.name}</p>
        <p className="flex items-center gap-1.5 text-xs text-fg-muted font-mono">
          <span style={{ fontFamily: `'${pairing.heading}'` }}>
            {pairing.heading}
          </span>
          <ArrowRight className="size-3" />
          <span style={{ fontFamily: `'${pairing.body}'` }}>
            {pairing.body}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        {pairing.moodTags ? (
          <span className="text-[10px] text-fg-muted font-mono">
            {pairing.moodTags}
          </span>
        ) : null}
        <button
          onClick={async () => {
            await deletePairing(pairing.id);
            router.refresh();
          }}
          className="text-fg-muted hover:text-danger"
          title="Delete pairing"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

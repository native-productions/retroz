"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import { mediaUrl } from "@/lib/media";
import { Lightbox } from "@/components/run/image-lightbox";

export interface GalleryImage {
  id: string;
  filename: string;
  relPath: string;
}

export function TaskGallery({ images }: { images: GalleryImage[] }) {
  const [index, setIndex] = React.useState<number | null>(null);

  return (
    <>
      {images.length === 0 ? (
        <div className="retro-card grid place-items-center gap-2 p-8 text-center">
          <div className="grid size-10 place-items-center rounded-full border-2 border-border bg-surface-2 text-fg-muted">
            <ImageOff className="size-5" />
          </div>
          <p className="text-xs text-fg-muted">
            Images from this task&apos;s runs appear here.
          </p>
        </div>
      ) : (
        <div className="grid max-h-[540px] grid-cols-3 items-start gap-3 overflow-y-auto overflow-x-hidden pr-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setIndex(i)}
              title={img.filename}
              className="block w-full rounded-[4px] border-2 border-border bg-surface-2 retro-press"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(img.relPath)}
                alt={img.filename}
                className="block h-auto w-full object-contain"
              />
            </button>
          ))}
        </div>
      )}

      <Lightbox
        images={images}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
      />
    </>
  );
}

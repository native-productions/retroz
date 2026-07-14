import * as React from "react";

/**
 * Fires `onFiles` with image files pasted anywhere on the page (Cmd/Ctrl+V).
 * Uses a ref so the listener attaches once and always calls the latest handler.
 */
export function useImagePaste(
  onFiles: (files: File[]) => void,
  enabled = true,
): void {
  const ref = React.useRef(onFiles);
  ref.current = onFiles;

  React.useEffect(() => {
    if (!enabled) return;
    function handler(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      let n = 0;
      for (const item of items) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (!file || !file.type.startsWith("image/")) continue;
        // pasted screenshots often have no / a generic name — give a stable one
        const named =
          file.name && file.name !== "image.png"
            ? file
            : new File([file], `pasted-${n + 1}.${file.type.split("/")[1] || "png"}`, {
                type: file.type,
              });
        files.push(named);
        n++;
      }
      if (files.length) {
        e.preventDefault();
        ref.current(files);
      }
    }
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [enabled]);
}

import { useEffect, useState } from "react";
import { Paperclip, X } from "@/lib/icons";
import { detach, displayName, fileToken, fileUrl, isImage } from "@/lib/attachments";

/** Thumbnails for images, chips for everything else; each opens in a new tab. */
export function Attachments({ todoId, names }: { todoId: string; names: string[] }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fileToken().then((t) => alive && setToken(t)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [names]);

  if (!names.length || !token) return null;
  const images = names.filter(isImage);
  const files = names.filter((n) => !isImage(n));

  const remove = (name: string) => (
    <button
      type="button"
      onClick={() => void detach(todoId, name)}
      className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow group-hover:flex hover:text-foreground"
      aria-label={`Remove ${displayName(name)}`}
    >
      <X className="h-3 w-3" />
    </button>
  );

  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((name) => (
            <div key={name} className="group relative">
              <a href={fileUrl(todoId, name, token)} target="_blank" rel="noreferrer">
                <img
                  src={fileUrl(todoId, name, token, true)}
                  alt={displayName(name)}
                  loading="lazy"
                  className="h-24 w-24 rounded-md object-cover ring-1 ring-border"
                />
              </a>
              {remove(name)}
            </div>
          ))}
        </div>
      )}
      {files.map((name) => (
        <div key={name} className="group relative flex items-center gap-2 rounded-md bg-secondary px-2 py-1.5 pr-8 text-xs">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <a href={fileUrl(todoId, name, token)} target="_blank" rel="noreferrer" className="truncate hover:underline">
            {displayName(name)}
          </a>
          {remove(name)}
        </div>
      ))}
    </div>
  );
}

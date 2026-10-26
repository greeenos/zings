import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic, Sparkles } from "@/lib/icons";
import { captureTodos } from "@/lib/ai";
import { DialogShell } from "@/components/todo/DialogShell";
import { cn } from "@/lib/utils";

// Chrome and Safari ship it prefixed; Firefox doesn't have it.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null;
  onend: (() => void) | null;
};
const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition })
  .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

/**
 * Speak or paste anything — a brain dump, an email, meeting notes — and get
 * separate to-dos back to review before they're added.
 */
export function CaptureDialog({
  open,
  initialText,
  onClose,
  onAdd,
}: {
  open: boolean;
  initialText: string;
  onClose: () => void;
  onAdd: (titles: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [titles, setTitles] = useState<string[] | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setTitles(null);
  }, [open, initialText]);

  useEffect(() => () => recognition.current?.stop(), []);

  const toggleMic = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    if (!SpeechRecognition) return;
    const r = new SpeechRecognition();
    r.lang = navigator.language;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let spoken = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) spoken += e.results[i][0].transcript;
      if (spoken) setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${spoken.trim()}`);
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    r.start();
    setListening(true);
  };

  const run = async () => {
    recognition.current?.stop();
    setBusy(true);
    const result = await captureTodos(text);
    setBusy(false);
    if (!result) return;
    setTitles(result);
    setKeep(result.map(() => true));
  };

  const chosen = titles?.filter((_, i) => keep[i]) ?? [];

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Capture"
      subtitle="Talk or paste — Zings turns it into to-dos."
      icon={<Sparkles className="h-[18px] w-[18px]" />}
      doneLabel="Cancel"
      doneTone="secondary"
    >
      {titles === null ? (
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            autoFocus
            placeholder="Call the dentist tomorrow at 9, buy a present for Eva by friday, and every monday water the plants…"
            className="w-full resize-none rounded-xl bg-background/70 p-3 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center gap-2">
            {SpeechRecognition && (
              <button
                type="button"
                onClick={toggleMic}
                aria-pressed={listening}
                className={cn("btn-3d btn-secondary btn-sm", listening && "!border-today !text-today")}
              >
                <Mic className="h-4 w-4" />
                {listening ? "Listening… tap to stop" : "Dictate"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy || !text.trim()}
              className="btn-3d btn-primary btn-sm ml-auto"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Make to-dos
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {titles.length === 0 && <p className="text-sm text-muted-foreground">No to-dos found in that text.</p>}
          <ul className="space-y-1">
            {titles.map((title, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary">
                  <input
                    type="checkbox"
                    checked={keep[i]}
                    onChange={() => setKeep((k) => k.map((v, j) => (j === i ? !v : v)))}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  <input
                    value={title}
                    onChange={(e) => setTitles((t) => t!.map((v, j) => (j === i ? e.target.value : v)))}
                    className="min-w-0 flex-1 bg-transparent outline-none"
                  />
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => setTitles(null)} className="btn-3d btn-secondary btn-sm">
              Back
            </button>
            <button
              type="button"
              disabled={!chosen.length}
              onClick={() => {
                onAdd(chosen);
                onClose();
              }}
              className="btn-3d btn-primary btn-sm ml-auto"
            >
              <Check className="h-4 w-4" />
              Add {chosen.length} to-do{chosen.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </DialogShell>
  );
}

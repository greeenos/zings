import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "@/lib/motion";
import { X } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  navigation?: React.ReactNode;
  /** Text on the closing button at the bottom. */
  doneLabel?: string;
  /** "secondary" when closing means cancelling, not finishing. */
  doneTone?: "primary" | "secondary";
}

/**
 * The card the Settings and Account panels are both poured into: backdrop,
 * sticky header, scroll body and the Done button that closes it.
 */
export function DialogShell({ open, onClose, title, subtitle, icon, children, navigation, doneLabel = "Done", doneTone = "primary" }: Props) {
  // Radix owns Escape, outside click, focus trap and scroll lock; framer only animates.
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm dark:bg-black/50"
              />
            </DialogPrimitive.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
              <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                  className="pointer-events-auto flex max-h-[94dvh] w-full max-w-[640px] min-w-0 flex-col overflow-hidden rounded-t-3xl sm:max-h-[min(88dvh,820px)] sm:rounded-3xl bg-card shadow-elevated ring-1 ring-border"
                >
                  <div className="z-10 flex shrink-0 items-start justify-between border-b border-border/70 bg-card/95 px-5 py-4 backdrop-blur sm:px-6 sm:py-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        {icon}
                      </span>
                      <div className="min-w-0">
                        <DialogPrimitive.Title className="font-display text-xl font-semibold">{title}</DialogPrimitive.Title>
                        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
                      </div>
                    </div>
                    <button
                      onClick={onClose}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {navigation && <div className="shrink-0 border-b border-border/70 bg-card px-4 py-2 sm:px-6">{navigation}</div>}
                  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
                    {children}
                  </div>
                  <div className="shrink-0 border-t border-border/70 bg-card px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                    <button
                      onClick={onClose}
                      className={`btn-3d min-h-11 w-full ${doneTone === "primary" ? "btn-primary" : "btn-secondary"}`}
                    >
                      {doneLabel}
                    </button>
                  </div>
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

/** One titled block inside a panel. */
export function DialogSection({
  icon,
  title,
  description,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl bg-secondary/20 p-4 ring-1 ring-border/70 sm:p-5", className)}>
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {description && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}

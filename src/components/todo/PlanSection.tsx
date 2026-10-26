import { useEffect, useState } from "react";
import { Star } from "@/lib/icons";
import { BillingStatus, goToPayment, loadBilling } from "@/lib/billing";
import { DialogSection } from "@/components/todo/DialogShell";

const button = "btn-3d btn-secondary btn-sm";

/** Free vs Pro on a hosted instance. Renders nothing when self-hosted. */
export function PlanSection() {
  const [status, setStatus] = useState<BillingStatus | null>(null);

  useEffect(() => {
    void loadBilling().then(setStatus);
  }, []);

  if (!status?.hosted) return null;
  const until = status.paidUntil ? new Date(status.paidUntil).toLocaleDateString() : "";

  return (
    <DialogSection
      icon={<Star className="h-4 w-4 text-star" />}
      title={status.pro ? "Zings Pro" : "Free plan"}
      description={
        status.pro
          ? status.autoRenews
            ? `Renews automatically. Paid until ${until}.`
            : `Paid until ${until}. Crypto payments don't renew themselves — you'll get a reminder a week before.`
          : `${status.openTodos} of ${status.freeTodoLimit} open to-dos. Pro removes the limit and adds sharing, attachments${status.aiOffered ? " and AI without your own key" : ""}.`
      }
    >
      <div className="mt-3 flex flex-wrap gap-2">
        {status.stripe && !status.autoRenews && (
          <>
            <button className={button} onClick={() => void goToPayment("/api/billing/stripe/checkout", { interval: "month" })}>
              €{status.priceMonthEur} / month
            </button>
            <button className="btn-3d btn-primary btn-sm" onClick={() => void goToPayment("/api/billing/stripe/checkout", { interval: "year" })}>
              €{status.priceYearEur} / year
            </button>
          </>
        )}
        {status.crypto && (
          <button className={button} onClick={() => void goToPayment("/api/billing/crypto/invoice")}>
            {status.pro ? "Add a year" : "1 year"} with crypto (€{status.priceYearEur})
          </button>
        )}
        {status.autoRenews && (
          <button className={button} onClick={() => void goToPayment("/api/billing/stripe/portal")}>
            Manage billing
          </button>
        )}
      </div>
    </DialogSection>
  );
}

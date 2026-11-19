import type { ReactNode } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Passkey and phone code as quieter options under the main form (or under the providers when passwords are off).
 * The passkey button renders nothing in a browser without passkeys, so the group hides itself when it holds no button.
 */
export function OtherSignInMethods({ passkey, onPhone, disabled, caption = "Other ways to sign in" }: { passkey: ReactNode; onPhone?: () => void; disabled: boolean; caption?: string | null }) {
  if (!passkey && !onPhone) return null;
  return (
    <div role="group" aria-label={caption ?? "Other ways to sign in"} className="hidden flex-col gap-2 has-[button]:flex">
      {caption ? <p className="text-center text-caption text-ink-muted">{caption}</p> : null}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2">
        {passkey}
        {onPhone ? (
          <Button variant="secondary" fullWidth startIcon={<Smartphone />} disabled={disabled} onClick={onPhone}>
            Use a phone code
          </Button>
        ) : null}
      </div>
    </div>
  );
}

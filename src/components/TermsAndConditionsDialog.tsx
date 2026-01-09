import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const TERMS_VERSION = "2025-12-21";
const STORAGE_KEY = "limit_terms_accepted_version";

type TermsAndConditionsDialogProps = {
  onAccepted?: () => void;
};

export function TermsAndConditionsDialog({ onAccepted }: TermsAndConditionsDialogProps) {
  const accepted = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === TERMS_VERSION;
  }, []);

  const [open, setOpen] = useState(!accepted);
  const [agreeChecked, setAgreeChecked] = useState(false);

  useEffect(() => {
    if (!accepted) setOpen(true);
  }, [accepted]);

  const accept = () => {
    window.localStorage.setItem(STORAGE_KEY, TERMS_VERSION);
    setOpen(false);
    onAccepted?.();
  };

  const decline = () => {
    window.close();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        hideClose
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>Terms & Conditions</DialogTitle>
          <DialogDescription>
            Please read and accept these Terms & Conditions to continue using Limit.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[55vh] rounded-md border border-border/70 p-4">
          <div className="space-y-4 text-sm leading-6">
            <div className="space-y-2">
              <div className="font-medium">1. Acceptance of Terms</div>
              <div>
                By installing, accessing, or using the Limit desktop application ("App"), you
                agree to be bound by these Terms & Conditions ("Terms"). If you do not agree,
                do not use the App.
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">2. License and Permitted Use</div>
              <div>
                Subject to your compliance with these Terms, you are granted a limited,
                non-exclusive, non-transferable, revocable license to use the App for your
                personal, non-commercial study and practice purposes.
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">3. User Responsibilities</div>
              <div>
                You agree to:
              </div>
              <div className="space-y-1 pl-4">
                <div>- Use the App in compliance with applicable laws and regulations.</div>
                <div>- Not attempt to bypass, disable, or interfere with security or access controls.</div>
                <div>- Not reverse engineer, decompile, or disassemble the App except where prohibited by law.</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">4. Content and Study Data</div>
              <div>
                The App may store study content, progress data, and related information locally on
                your device. You are responsible for maintaining backups and safeguarding your
                device. The App may also include features intended to support exam practice and
                focused study sessions.
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">5. Prohibited Activities</div>
              <div>
                You must not:
              </div>
              <div className="space-y-1 pl-4">
                <div>- Use the App to violate academic integrity policies or cheating regulations.</div>
                <div>- Use the App to collect or exfiltrate data from other users or systems.</div>
                <div>- Distribute, sell, rent, lease, sublicense, or otherwise transfer the App to others.</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">6. Updates and Changes</div>
              <div>
                We may update the App and may change these Terms from time to time. When Terms are
                updated, you may be asked to accept the new version to continue using the App.
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">7. Disclaimer of Warranties</div>
              <div>
                The App is provided on an "as is" and "as available" basis without warranties of
                any kind, whether express, implied, or statutory, including implied warranties of
                merchantability, fitness for a particular purpose, and non-infringement.
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">8. Limitation of Liability</div>
              <div>
                To the maximum extent permitted by law, in no event shall the App authors or
                distributors be liable for any indirect, incidental, special, consequential, or
                punitive damages, or any loss of data, profits, or business, arising out of or
                related to your use of the App.
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">9. Termination</div>
              <div>
                These Terms are effective until terminated. Your rights under these Terms will
                terminate automatically without notice if you fail to comply. Upon termination,
                you must stop using the App.
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">10. Contact</div>
              <div>
                If you have questions about these Terms, please contact the App publisher through
                the official channels provided with your distribution.
              </div>
            </div>

            <div className="text-xs text-muted-foreground">Version: {TERMS_VERSION}</div>
          </div>
        </ScrollArea>

        <div className="flex items-center gap-3">
          <Checkbox
            id="termsAgree"
            checked={agreeChecked}
            onCheckedChange={(v) => setAgreeChecked(v === true)}
          />
          <label htmlFor="termsAgree" className="text-sm leading-none">
            I have read and agree to the Terms & Conditions.
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={decline}>
            Decline
          </Button>
          <Button onClick={accept} disabled={!agreeChecked}>
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";

interface VerificationPanelProps {
  onVerify?: (token: string) => void;
  onExpireOrError?: () => void;
}

export default function VerificationPanel({
  onVerify,
  onExpireOrError,
}: VerificationPanelProps): React.JSX.Element {
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const siteKey = import.meta.env.VITE_CLOUDFLARE_SITE_KEY || "";

  const handleSuccess = (receivedToken: string): void => {
    setIsVerified(true);
    if (onVerify) {
      onVerify(receivedToken);
    }
  };

  const handleExpireOrError = (): void => {
    setIsVerified(false);
    if (onExpireOrError) {
      onExpireOrError();
    }
  };

  if (!siteKey) {
    return (
      <div className="turnstile-wrapper">
        <p className="helper-text error">
          VITE_CLOUDFLARE_SITE_KEY is not configured in .env.
        </p>
      </div>
    );
  }

  return (
    <div className={`turnstile-wrapper ${isVerified ? "verified" : "pending"}`}>
      <div className="turnstile-header">
        <span className="turnstile-title">
          {isVerified ? "✓ Security verification passed" : "Security Verification"}
        </span>
      </div>
      <Turnstile
        siteKey={siteKey}
        onSuccess={handleSuccess}
        onExpire={handleExpireOrError}
        onError={handleExpireOrError}
        options={{
          theme: "light",
          size: "normal",
        }}
      />
    </div>
  );
}

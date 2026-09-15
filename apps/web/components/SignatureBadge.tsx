import type { EsignatureVerification } from "@siteops/shared";

/**
 * Shows what an e-signature actually proves: not just "someone typed a
 * name," but that the signed content's hash, recomputed live from the
 * document as it stands right now, still matches what was hashed at signing
 * time. `verification.verified` is server-computed fresh on every fetch --
 * this component only renders the result, it never trusts a cached flag.
 */
export function SignatureBadge({
  verification,
  verifiedLabel,
  unverifiedLabel,
  signedByLabel,
  hashLabel,
}: {
  verification: EsignatureVerification;
  verifiedLabel: string;
  unverifiedLabel: string;
  signedByLabel: string;
  hashLabel: string;
}) {
  if (!verification.signed) return null;

  return (
    <div
      className={`rounded-lg border-2 px-3 py-2 text-xs ${
        verification.verified ? "border-navy-300 bg-navy-50 text-navy-800" : "border-maroon-400 bg-maroon-50 text-maroon-800"
      }`}
    >
      <p className="font-semibold">{verification.verified ? `✓ ${verifiedLabel}` : `⚠ ${unverifiedLabel}`}</p>
      <p>
        {signedByLabel}: {verification.signerName}
        {verification.signedAt && ` · ${new Date(verification.signedAt).toLocaleString()}`}
      </p>
      {verification.contentHash && (
        <p className="font-mono text-[11px] text-navy-500">
          {hashLabel}: {verification.contentHash.slice(0, 16)}…
        </p>
      )}
    </div>
  );
}

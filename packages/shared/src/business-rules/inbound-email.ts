/**
 * Parses raw email "To"/"From" header text as an inbound-email provider
 * (SendGrid Inbound Parse, Mailgun Routes, SES) would hand it to a webhook
 * -- comma-separated addresses, each optionally wrapped as
 * `Display Name <address@domain>`.
 */
function extractAddress(part: string): string {
  const match = part.match(/<([^>]+)>/);
  return (match?.[1] ?? part).trim();
}

/** Every address found in a raw header, lowercased, blanks and non-addresses dropped. */
export function parseEmailAddresses(header: string): string[] {
  return header
    .split(",")
    .map((part) => extractAddress(part).toLowerCase())
    .filter((address) => address.includes("@"));
}

/**
 * The project's inbound-email token is the local part of whichever
 * recipient address matches `inboundDomain` -- e.g. a "To" of
 * "Jane <jane@acme.com>, <a1b2c3...@inbound.siteops.local>" against domain
 * "inbound.siteops.local" yields "a1b2c3...". Null if no recipient matches,
 * so a project alias mistakenly BCC'd alongside unrelated recipients still
 * resolves, but mail never addressed to the inbound domain at all does not.
 */
export function extractInboundToken(toHeader: string, inboundDomain: string): string | null {
  const domain = inboundDomain.toLowerCase();
  for (const address of parseEmailAddresses(toHeader)) {
    const at = address.lastIndexOf("@");
    if (at === -1) continue;
    const localPart = address.slice(0, at);
    if (address.slice(at + 1) === domain && localPart.length > 0) return localPart;
  }
  return null;
}

/** The sender address a "From" header identifies, or null if it carries none. */
export function extractSenderAddress(fromHeader: string): string | null {
  return parseEmailAddresses(fromHeader)[0] ?? null;
}

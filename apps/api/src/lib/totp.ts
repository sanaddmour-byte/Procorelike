import { Secret, TOTP } from "otpauth";

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function buildTotp(secretBase32: string, label: string): TOTP {
  return new TOTP({
    issuer: "SiteOps",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function totpProvisioningUri(secretBase32: string, label: string): string {
  return buildTotp(secretBase32, label).toString();
}

export function verifyTotpCode(secretBase32: string, code: string, label: string): boolean {
  const delta = buildTotp(secretBase32, label).validate({ token: code, window: 1 });
  return delta !== null;
}

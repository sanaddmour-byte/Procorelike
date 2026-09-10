import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@siteops/shared"],
  // Defense-in-depth alongside the shared/server subpath split (see
  // packages/shared/src/index.ts): never let argon2's native binding be
  // pulled into a webpack bundle, client or server.
  serverExternalPackages: ["@node-rs/argon2"],
};

export default withNextIntl(nextConfig);

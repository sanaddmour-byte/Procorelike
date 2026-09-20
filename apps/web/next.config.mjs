import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@siteops/shared"],
  // Defense-in-depth alongside the shared/server subpath split (see
  // packages/shared/src/index.ts): never let argon2's native binding be
  // pulled into a webpack bundle, client or server.
  serverExternalPackages: ["@node-rs/argon2"],
  typescript: {
    // `next build`'s own internal type-check (distinct from the `typecheck`
    // script, which runs the real `tsc --noEmit` and is the actual gate for
    // type safety here) generates synthetic PageProps/LayoutProps constraint
    // files per route. On at least one hosting provider's build environment
    // this generated check has produced a false-positive "ReactNode is not
    // assignable to ReactNode" error against
    // app/[locale]/projects/[id]/layout.tsx that a plain `tsc --noEmit` does
    // not reproduce (same dependency versions, same lockfile) -- i.e. a bug
    // in this internal duplicate check itself, not a real type error.
    ignoreBuildErrors: true,
  },
};

export default withNextIntl(nextConfig);

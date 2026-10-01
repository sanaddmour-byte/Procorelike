# Spec: two-stage authentication and automated email notifications (Addendum E)

Status: **proposal, awaiting approval. No application code has been written.**
Scope of this document: E14 steps 1–4 (inspect, resolve E0, list conflicts, order the work, flag review items).

Inspected: `CLAUDE.md`, `docs/`, `apps/api/src/{services/auth.service.ts, routes/auth.routes.ts, services/notification.service.ts, lib/{mailer,tokens,totp,jwt}.ts, middleware/auth.ts, jobs/*}`, `packages/db/src/schema/core.ts`, `packages/db/src/sql/001_rls_and_functions.sql`, `packages/shared/src/auth/password.ts`, `packages/shared/src/schemas/{auth,notification}.schema.ts`, web `login` and `accept-invite` pages, mobile `login.tsx` and `auth-context.tsx`, `docker-compose.yml`, `docs/DEPLOYMENT.md`.

---

## 1. What already exists (do not overwrite)

| Area | Today | Where |
|---|---|---|
| Login | `POST /auth/login`, **global email + password**, optional `totpCode`; one generic message for wrong email/password; no rate limit, no lockout, no timing equalisation, no audit event | `auth.service.ts`, `loginSchema` (strict `email`) |
| Password hash | `@node-rs/argon2` `hash()` with library defaults (argon2id, 19 MiB, t=2, p=1 — i.e. exactly the E3 floor, never tuned, no ADR) | `packages/shared/src/auth/password.ts` |
| Password policy | Only `min(12) max(200)` at accept-invite. No common-password list, no username/company check, no `must_change_password`. There is **no change-password or reset endpoint** | `acceptInviteSchema` |
| Tokens | 15 min JWT `{sub, email}`; opaque refresh token (HMAC-SHA256 hashed), per row `device_label`, `expires_at`, `revoked_at`; **rotation yes, reuse detection no** (a replayed revoked token just gets 401) | `refresh_tokens`, `auth.service.ts` |
| Web session | Bearer tokens kept in `localStorage` (`siteops.auth`) | `apps/web/lib/auth-storage.ts` |
| Mobile session | `expo-secure-store` for tokens; no biometrics | `apps/mobile/lib/auth-*.ts` |
| Invites | `invites` table, **project-scoped**, keyed by email, `role`, 7-day single-use token (HMAC hash); accept creates user + `user_companies` + `project_users`. Invite email is sent **inside the request** (best-effort) | `createInvite`, `acceptInvite` |
| Tenancy | `companies` (name, type gc/sub/consultant/owner, logo as base64). `project_companies` attaches firms to projects. `user_companies` is a **join table** (a user can have several). RLS visibility of companies is via project membership; there is no company code, status or company-level admin | `core.ts`, `001_rls_and_functions.sql` |
| TOTP | Verify at login exists (`otpauth`, SHA1/6/30s, window ±1). `enrollTotpSchema` exists, but I found **no enrolment route**. Secret stored unencrypted in `users.totp_secret` | `totp.ts`, `users` |
| Email transport | `nodemailer` SMTP (MailHog locally). Plain-text only, English only, **sent synchronously from services and cron jobs**, no queue, retry, bounce handling or suppression | `lib/mailer.ts` |
| Notifications | In-app `notifications` table + Expo push. `notifyUser(tx, recipient, actor, type, payload)` is called **inline, from 13 call sites in services**, inside the actor's transaction; skips the actor. 8 notification types. No preferences, no digest, no coalescing, no admin copies | `notification.service.ts`, `NOTIFICATION_TYPES` |
| Jobs | No scheduler. External cron calls `POST /internal/rfi-overdue` and `/internal/daily-digest` (shared-secret gated); both send mail directly | `jobs/*` |
| Event bus / outbox | **Does not exist** (Addendum B4 not built) | — |
| Rate limiting | **None.** No Redis in the repo | — |
| Audit | Generic `audit_log` (entity changes). No auth events | `audit_log` |
| Platform admin | **Does not exist.** `admin.routes.ts` is API-key/webhook admin, not a platform console | — |
| Production | Railway: `@siteops/web` and `@siteops/api` on separate `*.up.railway.app` hosts, Postgres, 12 users, no custom domain, no verified email domain, no SMTP provider configured in docs | `docs/DEPLOYMENT.md` |

## 2. E0 decisions

| # | Addendum default | Verdict |
|---|---|---|
| 1 | Every firm is a `companies` row with its own code, attached via `project_companies` | **Adopt.** Matches the current table. Two additions are needed: a company-level admin concept (see C3) and EN + AR names |
| 2 | One user = one company = one login | **Adopt**, but it is a **breaking migration**: it conflicts with `user_companies` and with the RLS helper functions built on it (C1) |
| 3 | Username: 3–32 ASCII, unique per company | **Adopt.** Backfill existing users from the email local-part |
| 4 | Email login allowed at Stage 2, email unique per company | **Adopt.** Today email is globally unique; that index is replaced |
| 5 | 2FA required for `owner_admin` and platform admins | **Adopt with a clarification.** `owner_admin` is a per-project role here, not a company attribute. Proposal: require 2FA for any user who is a company admin (C3) or who holds `owner_admin` on any project |

I could not answer E0 questions from the repo alone beyond the above. Open questions I need answered are in section 7.

## 3. Conflicts with the existing code and with v2 / Addenda A–D

Each has a recommendation. Items marked **DECISION** block the start of the affected work.

**C1. `user_companies` join table vs one-user-one-company (E0-2).** Today a person can belong to several companies, and `user_companies` is referenced seven times in `001_rls_and_functions.sql` (helper functions and policies). Recommendation: keep the table (RLS depends on it), add `users.company_id NOT NULL`, backfill from the single `user_companies` row, **fail the migration if any user has more than one** (query production first; the seed should be checked too), and add a constraint/trigger so `user_companies` always equals `users.company_id`. Remove the table only in a later clean-up phase.

**C2. Global unique email vs per-company uniqueness (E0-4).** `users_email_unique` is global and `login` looks users up by email alone. The new lookup is `(company_id, username_normalized | email_normalized)`. All 49 files that call `/auth/login` (API tests, Playwright specs, the UX measurement harness, the seed) must send a company context. Recommendation: keep a **temporary compatibility path** behind a flag (email-only login while exactly one company has that email) so the migration is not a flag day, then delete it.

**C3. No company-admin concept.** Authority today is per-project (`directory:admin`). E2 needs "company admin" (invite users into *my* company, view sessions, see the code) and E0-5 needs it for 2FA. Recommendation: add `users.is_company_admin boolean` (set for the first admin at company creation, grantable by another company admin). **DECISION: confirm.**

**C4. Who creates subcontractor users?** Today a project admin invites anyone, into any company already on the project (`inviteUserSchema` carries `companyId`). Under E0-1/E2, a firm's people belong to that firm's company and are invited by that firm's admin, and a company is created only by a platform admin. That removes the current ability of a GC to onboard a sub's first person. **DECISION:** either (a) keep project-level invite of external users (the invitee lands in the named company, which must already be `active`), plus a "request platform admin to create this firm" path; or (b) allow a GC project admin to create a firm in `invited` state and email its first admin using the E2 flow. I recommend (b), and I will not build either until you choose.

**C5. Transport, and where mail may be sent from.** v2 specifies a provider-agnostic adapter (Resend or SES); the repo only has SMTP via nodemailer. Railway restricts outbound SMTP on some plans (to be verified against the current plan), so SMTP may not work in production at all. Recommendation: keep `nodemailer` for local/MailHog, add an HTTP-API adapter (Resend by default) behind one `MailTransport` interface, selected by env. **DECISION: provider.**

**C6. Domain.** E2, E9 and E11 need `admin.{{domain}}`, `mail.{{domain}}` (SPF/DKIM/DMARC), `app.{{domain}}` (deep links, universal links, AASA/assetlinks). Production runs on `*.up.railway.app` today, which cannot carry any of that. **DECISION: the domain.** Nothing in E9 deliverability or E11 deep links can ship without it.

**C7. Cookies and CSRF (E1) vs localStorage Bearer tokens.** The web app keeps tokens in `localStorage`, the offline outbox and service worker assume a Bearer header, and web and API are on different registrable sites on Railway (`up.railway.app` is on the Public Suffix List), so `SameSite=Lax` cookies would not be sent to the API. Moving to httpOnly cookies therefore requires either a custom domain with web and API as siblings, or a Next.js BFF proxy. Recommendation: do it after C6, as its own task (~24 h) and keep Bearer for mobile. Until then, the web keeps localStorage, which is a known weaker posture for XSS. **DECISION: accept the interim.**

**C8. Email sent in-request and from cron jobs (E15).** `createInvite`, the overdue-RFI sweep and the daily digest all call the mailer directly. They must move to the outbox + worker. The existing daily digest also ignores permissions (it lists RFIs across all of a user's projects with no per-recipient rendering), so it cannot be kept as-is.

**C9. No event bus (Addendum B4).** Notifications are inline `notifyUser` calls. Recommendation: add a `domain_events` outbox table written in the same transaction, a worker that fans events out to (a) the existing in-app/push path, unchanged, and (b) the new email engine. Convert the 13 call sites by replacing the `notifyUser` call with a published event, one module at a time; the in-app notification then becomes a subscriber too. No behaviour change for in-app users during the migration.

**C10. Worker and scheduler.** E9/E10 need a long-running worker (email queue, digests, reminders at 07:00 project-local). Today there is no in-process scheduler. Recommendation: one new Railway service `@siteops/worker` running the queue loop plus an interval scheduler, replacing the external-cron `/internal/*` endpoints (keep the endpoints for manual runs). Adds a service and its cost. **DECISION: confirm the extra service.**

**C11. Rate limiting store.** E7 assumes Redis or Postgres. There is no Redis. Recommendation: Postgres-backed counters (an `auth_rate_limits` table with `(key, window_start, count)` and an index) behind a `RateLimiter` interface; the expected auth volume is small. Add Redis only if load demands it. **DECISION: confirm no Redis.**

**C12. Password minimum.** E3 says min 10; the existing invite schema enforces min 12. Lowering would weaken the current rule. Recommendation: keep **12** for new passwords unless you want 10; E3's other rules (128 max, common-password list, no username/company name, no forced rotation) are additive.

**C13. Session claims and revocation.** The access JWT carries `{sub, email}` and RLS context uses only `userId`. For E1/E4 ("revoke every session") the access token should also carry a session id (`sid`) and `cid` (company), and `requireAuth` should reject tokens whose session is revoked. This adds one indexed lookup per request. Alternative: accept up to 15 minutes of residual access after revoke. Recommendation: the lookup, cached for 30 s in memory.

**C14. TOTP.** Enrolment route is missing; the secret is stored in clear. Recommendation: add enrol/verify/disable routes, encrypt the secret (AES-256-GCM, key in env), add 10 hashed recovery codes. Required for platform admins and company admins; "magic-link does not bypass it" is enforced in the login service, not the UI.

**C15. Reset/magic/invite tokens.** E6's `auth_tokens` has no place for an invite's **project assignments and role**. Add `payload jsonb` (validated by zod per `type`). This also lets the existing project-scoped `invites` table be retired later; keep it until the accept flow moves.

**C16. Existing production data.** 12 users, a handful of companies, no codes, no usernames. The migration must generate a code for every existing company (shown once to a platform admin, not emailed) and a username for every user. A first platform admin must be created by a one-off CLI script (with TOTP enrolment), since the console itself requires one to log in.

**C17. Permission-aware email rendering (E10 rule 4).** RLS already enforces row visibility as the *recipient*. Recommendation: the renderer loads each record inside `withRequestContext({ userId: recipient })`, so the database, not application code, decides whether the recipient can see it; then apply field-level redaction for money using the shared permission engine (`budget`, `commitments`, `change_management`, `progress_billing`, `prime_contract`, `direct_costs` ≥ `read`). A test greps rendered bodies for the amount.

**C18. "Project admin" is not defined in the schema.** E10 uses it. Proposal: a user is a project admin when they hold `directory:admin` on the project, or `project_users.receives_admin_copies = true` (new column). **DECISION: confirm** (the alternative is the `owner_admin` role only).

**C19. Calendar and holidays.** `packages/shared` has working-time math from Phase 11d, but I did not confirm it supports a per-project holiday list including moveable Islamic holidays. Reminders (E10-8, acceptance test 18) depend on it. To be verified before estimating that task; I will report the gap rather than hardcode dates.

**C20. Partitioned `auth_events` (Addendum B6).** Drizzle cannot express declarative partitions; use a hand-written SQL migration plus a monthly partition-creation job. Fine, but it needs the worker (C10).

**C21. Secrets.** New production secrets are needed: `COMPANY_CODE_PEPPER`, `TENANT_CONTEXT_SECRET`, `AUTH_ENCRYPTION_KEY` (company-code copy, TOTP), mail-provider key and webhook secret. They must be added to Railway and documented; losing the encryption key makes stored company codes unrecoverable (admins would need a rotation).

**C22. Mobile.** Biometrics need `expo-local-authentication`; app links need the C6 domain, iOS bundle id/team id and Android signing fingerprint. All are new native config; none can be verified without a device build, so they will be delivered as "typechecked, not device-tested" like the UX work.

**C23. Company code scheme.** E1 says 8 characters with an 8th check character. That gives 7 data characters (2^35). Crockford's own check symbol uses a mod-37 alphabet with extra symbols, which does not fit "8 characters of Base32", so I will use a **mod-32 weighted check character** over the 7 data characters (catches all single-character errors and nearly all adjacent transpositions). Implementation detail, no decision needed.

**C24. Stage 1 returns name and logo.** Logos are stored inline as base64 in `companies`. The Stage 1 response will carry a thumbnail-sized logo or a logo URL; large inline images would bloat a pre-auth endpoint. Needs a size cap or a derived thumbnail.

## 4. Mapping of Addendum E onto the code

| Section | Plan |
|---|---|
| E1 Stage 1 | New `POST /auth/company` (code → signed 10-min tenant token + name/logo); constant-time, uniform latency; device cookie/secure-store remembers the company; deep links carry the company slug |
| E1 Stage 2 | `POST /auth/login` takes `{ tenantToken, identifier, password, totpCode? }`; old email-only body accepted behind the compat flag (C2) |
| E1 Session | Extend `refresh_tokens` with `family_id`, `rotated_from`, `last_used_at`, `platform`, `device_id`; reuse detection revokes the family and queues an email; new-device email; mobile 60-day rolling + biometrics |
| E2 Platform admin | New `platform_admins` table and console (recommend a route group in `apps/web` gated by host, rather than a new app); TOTP mandatory; platform audit log; company lifecycle actions |
| E2 Company admin | New settings pages in `apps/web`: invite users, sessions, code view, auth log |
| E3 Passwords | Keep argon2id; record parameters in an ADR after tuning on the Railway instance; rehash on login if parameters change; policy module in `packages/shared`; log/Sentry scrubber (there is no Sentry in the repo today, so the scrubber applies to `console` logging and any future Sentry) |
| E4 Reset | `POST /auth/forgot` (uniform), `GET /auth/reset/validate`, `POST /auth/reset` (atomic) |
| E5 Magic link | `POST /auth/magic`, confirm page, POST consume, browser nonce, TOTP still required |
| E6 Data model | Migration set listed in task A1–A3 below; `docs/DATA_MODEL.md` updated with it |
| E7 Abuse | `RateLimiter` over Postgres (C11); progressive delay; dummy verify; tests for timing |
| E8 Audit | `auth_events` written in the same transaction; company-admin view of own users, 90 days |
| E9 Pipeline | Outbox tables, worker, provider adapter, webhooks, suppression, MJML templates with EN/AR, dev preview, MailHog harness, `/ready` check, `docs/EMAIL_SETUP.md` |
| E10 Engine | Event publisher at the 13 call sites; recipient resolver; per-recipient renderer; preferences; coalescing; digests; reminder scheduler |
| E11 Content and deep links | `/c/{company_slug}/p/{project_id}/{module}/{record_id}` route on web; `return_to` allowlist; AASA/assetlinks after C6 |

## 5. Ordered task list

Hours are for one engineer, include tests and docs, and carry about ±30 % uncertainty. "Review" marks items for your personal review (section 6).

### Group A: email pipeline (build first, E9) — 52 h
| # | Task | Hours |
|---|---|---|
| A1 | Schema: `email_messages`, `email_events`, `email_suppressions`, `domain_events` outbox (+ migration, RLS/ownership notes) | 6 |
| A2 | `MailTransport` interface; SMTP + HTTP-API adapters; env wiring | 8 |
| A3 | Worker service: claim/lock, dedupe key, retry/backoff, transient vs permanent, delivery log | 12 |
| A4 | Provider webhooks (delivered, bounced, complained, opened) + suppression + admin flag | 8 |
| A5 | Template system (MJML or react-email), shared layout, EN/AR, `ar-JO` and project-timezone formatting, `/dev/emails` preview, snapshot tests | 14 |
| A6 | `docs/EMAIL_SETUP.md`, `/ready` domain check, staging sink and subject prefix, MailHog Playwright helper | 4 |

### Group B: auth core (E1, E3–E8) — about 235 h
| # | Task | Hours | Review |
|---|---|---|---|
| B1 | Migration: `companies` code columns and status, `company_code_history`, `users` username/email_normalized/status/lockout fields/`company_id`, constraints; backfill (codes, usernames); `DATA_MODEL.md` | 16 | yes |
| B2 | Company-code module: generate, checksum, HMAC lookup, encrypted display copy, rotation grace | 8 | yes |
| B3 | Stage 1 endpoint, signed tenant token, uniform latency | 10 | |
| B4 | `RateLimiter` (Postgres) + progressive delay + soft-lock + config + tests | 14 | yes |
| B5 | Stage 2 login: username or email, dummy verify, generic errors, compat flag, TOTP gate | 14 | yes |
| B6 | Sessions: family, reuse detection, `sid`/`cid` claims, per-device list and revoke, new-device email | 16 | yes |
| B7 | Password policy module (length, common-password list, username/company check), hashing ADR, rehash-on-login, log scrubber and test | 10 | yes |
| B8 | `auth_tokens` + purge job; forgot/reset two-step flow incl. revoke-all and notification email | 16 | yes |
| B9 | Magic link with browser nonce; scanner-safe confirm; TOTP interaction | 14 | yes |
| B10 | Invite creation and accept (two-step), company-level invites carrying project assignments (C15) | 12 | |
| B11 | TOTP enrol/verify/disable, encrypted secret, recovery codes, enforcement rule | 14 | yes |
| B12 | `auth_events` partitioned table, writers inside transactions, company-admin and platform views | 10 | |
| B13 | Web UI: Stage 1, Stage 2, forgot, reset, magic confirm, company switcher, `return_to`, Arabic/RTL, 48 px targets | 28 | |
| B14 | Cookie + CSRF migration for web (after C6/C7) | 24 | yes |
| B15 | Mobile: secure-store company memory, biometric unlock, 60-day refresh, app links (config only) | 22 | |
| B16 | Acceptance tests E13 #2–#9, #16, plus migration of the 49 login-using test and harness files | 27 | |

### Group C: platform admin and company admin (E2) — about 70 h
| # | Task | Hours | Review |
|---|---|---|---|
| C1 | `platform_admins`, bootstrap CLI with TOTP, IP allowlist, platform audit log | 14 | yes |
| C2 | Console: create company (generates code, welcome email), suspend/reactivate/rotate/revoke, resend invite | 20 | |
| C3 | Company-admin pages: users, invites, disable/enable, force reset, sessions, code, auth log | 24 | |
| C4 | Tests E13 #1 and lifecycle audit assertions | 12 | |

### Group D: notification engine (E10, E11) — about 165 h
| # | Task | Hours | Review |
|---|---|---|---|
| D1 | Publish domain events at the 13 existing call sites; keep in-app and push as subscribers | 16 | |
| D2 | Recipient resolver: matrix, actor exclusion, role dedupe, admin copies, distribution, `receives_admin_copies` | 20 | |
| D3 | Per-recipient renderer via recipient RLS context + financial redaction + client_viewer rules | 16 | yes |
| D4 | Preferences model, API and Notifications screen, quiet hours, per-project admin-copy mode | 30 | |
| D5 | 5-minute coalescing | 8 | |
| D6 | Hourly/daily digest job and template | 14 | |
| D7 | Reminder scheduler (due-soon/today/overdue), project calendar, escalation chain, idempotency (needs C19) | 24 | |
| D8 | Retire the direct-mail overdue and digest jobs onto the pipeline | 6 | |
| D9 | Deep-link route `/c/...`, signed-out and wrong-project handling | 10 | |
| D10 | Tests E13 #10–#15, #17, #18 | 21 | |

### Group E: templates per module (EN + AR, with permission-aware tests) — about 80 h
Punch item and daily log base set 12 h; RFI, submittal, inspection, drawing revision 5 h each (20 h); change orders, T&M, safety, correspondence, meetings 5 h each (25 h); financial templates with redaction tests 10 h; shared digest sections 13 h. WIR and NCR templates only if those modules exist in this repo; I did not find them.

**Total ≈ 600 h** (A 52, B 235, C 70, D 165, E 80). Suggested delivery order matches E12: A, then B+C, then D with the punch/daily-log templates, then per-module templates alongside each module.

## 6. Items flagged for your personal review (Addendum C9)

1. Password hashing parameters and the tuning ADR (B7).
2. Token handling: generation, hashing, single-use consumption, scanner-safe two-step pages, session claims, reuse detection (B6, B8, B9).
3. Rate-limit configuration values and the Postgres limiter (B4).
4. The permission-aware email renderer, in particular financial redaction and the `client_viewer` rule (D3).
5. Any migration touching `users`: `company_id`, uniqueness changes, backfill, drop of global email uniqueness (B1).
6. Company-code storage and encryption, rotation grace (B2).
7. Platform admin bootstrap, TOTP mandatory, and IP allowlist (C1).
8. TOTP secret encryption and recovery codes (B11).

## 7. Decisions and answers needed before any code

1. **Domain** for `app.`, `admin.`, `mail.` (C6). Blocks DNS/deliverability, deep links, and cookies.
2. **Mail provider** (C5). I recommend Resend (HTTP API) and will keep SMTP for local only.
3. **Cookie/CSRF now or later** (C7): accept localStorage until the domain exists?
4. **Who onboards subcontractor firms** (C4): option (a) or (b)?
5. **Company-admin flag** and **"project admin" definition** (C3, C18).
6. **Extra Railway worker service** (C10) and **no Redis** (C11).
7. **Password minimum**: keep 12 or lower to 10 (C12).
8. **Multi-company users**: are there any in production today? (C1). I cannot query production from here; please confirm or let me run a read-only count.
9. Confirm the E0 defaults in section 2 as written.
10. Optional, off by default unless you say otherwise: HIBP check (outbound call) and Turnstile/hCaptcha (new dependency).

I will not start implementation until you approve this document and answer 1–9.

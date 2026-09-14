import { randomUUID } from "node:crypto";
import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  defaultTemplateNameForRole,
  type AcceptInviteInput,
  type InviteUserInput,
  type LoginInput,
  type UpdateMyProfileInput,
} from "@siteops/shared";
import { hashPassword, verifyPassword } from "@siteops/shared/server";
import { eq } from "drizzle-orm";
import type { Transporter } from "nodemailer";
import type { Env } from "../env";
import { ApiError, UnauthorizedError } from "../lib/errors";
import { parseDurationMs } from "../lib/duration";
import { signAccessToken } from "../lib/jwt";
import { sendInviteEmail } from "../lib/mailer";
import { generateOpaqueToken, hmacSha256 } from "../lib/tokens";
import { verifyTotpCode } from "../lib/totp";

export interface AuthDeps {
  authDb: Database;
  appDb: Database;
  env: Env;
  mailer?: Transporter;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; localePref: string };
}

async function issueTokens(
  deps: AuthDeps,
  user: { id: string; email: string; name: string; localePref: string },
): Promise<AuthTokens> {
  const accessToken = signAccessToken(deps.env, { sub: user.id, email: user.email });
  const refreshToken = generateOpaqueToken();
  const tokenHash = hmacSha256(deps.env.JWT_REFRESH_SECRET, refreshToken);
  const expiresAt = new Date(Date.now() + parseDurationMs(deps.env.JWT_REFRESH_TTL));

  await withRequestContext(deps.appDb, { userId: user.id }, async (tx) => {
    await tx.insert(schema.refreshTokens).values({ userId: user.id, tokenHash, expiresAt });
  });

  return { accessToken, refreshToken, user };
}

export async function login(deps: AuthDeps, input: LoginInput): Promise<AuthTokens> {
  // authDb: no session context exists yet — this lookup-by-email is the
  // one place password verification, not RLS, is the security boundary.
  const [user] = await deps.authDb
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, input.email))
    .limit(1);

  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }
  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (user.totpEnabled) {
    if (!input.totpCode) {
      throw new ApiError(401, "totp_required", "A TOTP code is required for this account");
    }
    if (!user.totpSecret || !verifyTotpCode(user.totpSecret, input.totpCode, user.email)) {
      throw new UnauthorizedError("Invalid TOTP code");
    }
  }

  return issueTokens(deps, user);
}

export async function refresh(deps: AuthDeps, refreshToken: string): Promise<AuthTokens> {
  const tokenHash = hmacSha256(deps.env.JWT_REFRESH_SECRET, refreshToken);

  // authDb: we don't yet know which user this hash belongs to.
  const [tokenRow] = await deps.authDb
    .select()
    .from(schema.refreshTokens)
    .where(eq(schema.refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRow || tokenRow.revokedAt || tokenRow.expiresAt < new Date()) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  const [user] = await deps.authDb
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, tokenRow.userId))
    .limit(1);
  if (!user) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  // Rotate: revoke the presented token, issue a fresh pair.
  await withRequestContext(deps.appDb, { userId: user.id }, async (tx) => {
    await tx
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.refreshTokens.id, tokenRow.id));
  });

  return issueTokens(deps, user);
}

export async function logout(deps: AuthDeps, refreshToken: string): Promise<void> {
  const tokenHash = hmacSha256(deps.env.JWT_REFRESH_SECRET, refreshToken);
  const [tokenRow] = await deps.authDb
    .select()
    .from(schema.refreshTokens)
    .where(eq(schema.refreshTokens.tokenHash, tokenHash))
    .limit(1);
  if (!tokenRow) return;

  await withRequestContext(deps.appDb, { userId: tokenRow.userId }, async (tx) => {
    await tx
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.refreshTokens.id, tokenRow.id));
  });
}

/** Caller must already be permission-checked (directory:standard+) on the target project by the route handler. */
export async function createInvite(
  deps: AuthDeps,
  inviterUserId: string,
  input: InviteUserInput,
): Promise<{ inviteToken: string }> {
  const inviteToken = generateOpaqueToken();
  const tokenHash = hmacSha256(deps.env.INVITE_TOKEN_SECRET, inviteToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const { projectName, inviterName } = await withRequestContext(deps.appDb, { userId: inviterUserId }, async (tx) => {
    await tx.insert(schema.invites).values({
      email: input.email,
      companyId: input.companyId,
      projectId: input.projectId,
      role: input.role,
      tokenHash,
      invitedBy: inviterUserId,
      expiresAt,
    });

    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, input.projectId)).limit(1);
    const [inviter] = await tx.select().from(schema.users).where(eq(schema.users.id, inviterUserId)).limit(1);
    return { projectName: project?.name ?? "your project", inviterName: inviter?.name ?? "A team member" };
  });

  // Best-effort: the invite row (and its returned inviteToken, shown to the
  // inviter as a fallback share link) is the real deliverable -- a down
  // SMTP relay should never fail invite creation itself.
  if (deps.mailer) {
    const acceptUrl = `${deps.env.CORS_ORIGIN}/en/accept-invite?token=${inviteToken}`;
    sendInviteEmail(deps.mailer, deps.env, {
      to: input.email,
      inviterName,
      projectName,
      acceptUrl,
    }).catch((err) => console.error("Failed to send invite email", err));
  }

  return { inviteToken };
}

/** Self-service profile edit (PATCH /auth/me) -- RLS's users_self_update policy only allows a user to update their own row, so this is deliberately not parameterized by a target user id. */
export async function updateMyProfile(
  deps: AuthDeps,
  userId: string,
  input: UpdateMyProfileInput,
): Promise<{ id: string; email: string; name: string; businessPhone: string | null; mobilePhone: string | null }> {
  return withRequestContext(deps.appDb, { userId }, async (tx) => {
    const [updated] = await tx
      .update(schema.users)
      .set(input)
      .where(eq(schema.users.id, userId))
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        businessPhone: schema.users.businessPhone,
        mobilePhone: schema.users.mobilePhone,
      });
    if (!updated) throw new ApiError(404, "not_found", "User not found");
    return updated;
  });
}

export async function acceptInvite(deps: AuthDeps, input: AcceptInviteInput): Promise<AuthTokens> {
  const tokenHash = hmacSha256(deps.env.INVITE_TOKEN_SECRET, input.inviteToken);

  // authDb: the accepting party has no session/project membership yet —
  // the invite token itself (single-use, expiring) is the security boundary.
  const [invite] = await deps.authDb
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, tokenHash))
    .limit(1);

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw new ApiError(400, "invalid_invite", "This invite is invalid, expired, or already used");
  }

  const passwordHash = await hashPassword(input.password);
  const newUserId = randomUUID();

  const [template] = await deps.authDb
    .select()
    .from(schema.permissionTemplates)
    .where(eq(schema.permissionTemplates.name, defaultTemplateNameForRole(invite.role)))
    .limit(1);

  const user = await withRequestContext(deps.appDb, { userId: newUserId }, async (tx) => {
    const [createdUser] = await tx
      .insert(schema.users)
      .values({ id: newUserId, email: invite.email, passwordHash, name: input.name })
      .returning();
    if (!createdUser) throw new Error("Failed to create user from invite");

    await tx.insert(schema.userCompanies).values({
      userId: newUserId,
      companyId: invite.companyId,
    });

    await tx.insert(schema.projectUsers).values({
      projectId: invite.projectId,
      userId: newUserId,
      companyId: invite.companyId,
      role: invite.role,
      permissionTemplateId: template?.id,
    });

    return createdUser;
  });

  // authDb here: marking the invite consumed isn't project-scoped data.
  await deps.authDb
    .update(schema.invites)
    .set({ acceptedAt: new Date() })
    .where(eq(schema.invites.id, invite.id));

  return issueTokens(deps, user);
}

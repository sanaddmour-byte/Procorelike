/**
 * Claims embedded in the short-lived JWT access token. Deliberately minimal
 * (no per-project role snapshot) — project membership/role/permissions are
 * looked up fresh from the DB on every request (within the RLS-scoped
 * transaction) so a role or permission change takes effect immediately
 * rather than waiting for the next token refresh.
 */
export interface AccessTokenClaims {
  sub: string; // user id
  email: string;
}

export interface ApiErrorBody {
  error: {
    message: string;
    code: string;
    correlationId: string;
  };
}

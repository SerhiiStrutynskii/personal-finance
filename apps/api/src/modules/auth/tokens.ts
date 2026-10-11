import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const ISSUER = 'household-finance';
const ALGORITHM = 'HS256';

export function createTokenService(secret: string) {
  const key = new TextEncoder().encode(secret);

  return {
    signAccessToken(userId: string, now: Date = new Date()): Promise<string> {
      const issuedAt = Math.floor(now.getTime() / 1000);
      return new SignJWT()
        .setProtectedHeader({ alg: ALGORITHM })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
        .sign(key);
    },

    /** Повертає id користувача або undefined, якщо токен підроблений, чужий чи прострочений. */
    async verifyAccessToken(token: string): Promise<string | undefined> {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          algorithms: [ALGORITHM],
        });
        return payload.sub;
      } catch {
        return undefined;
      }
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;

export const generateRefreshToken = (): string => randomBytes(32).toString('base64url');

export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

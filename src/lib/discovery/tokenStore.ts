// Holds temporary pairing tokens in memory — supports multiple concurrent tokens
// to avoid race conditions when multiple browser tabs generate QR codes.

const tokens = new Map<string, number>(); // token → expiresAt timestamp

export const tokenStore = {
  setToken(token: string, expiresInMs: number) {
    // Cleanup expired tokens on every new insert to prevent unbounded growth
    const now = Date.now();
    for (const [t, exp] of tokens) {
      if (now > exp) tokens.delete(t);
    }
    tokens.set(token, now + expiresInMs);
  },

  isValid(tokenToTest: string): boolean {
    const expiresAt = tokens.get(tokenToTest);
    if (expiresAt === undefined) return false;
    if (Date.now() > expiresAt) {
      tokens.delete(tokenToTest); // Clear expired token
      return false;
    }
    return true;
  },

  /** Consume the token — single-use. Deletes it after successful validation. */
  consume(tokenToTest: string): boolean {
    if (!this.isValid(tokenToTest)) return false;
    tokens.delete(tokenToTest);
    return true;
  },

  clear() {
    tokens.clear();
  }
};
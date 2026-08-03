// This holds our temporary pairing token in memory
export const tokenStore = {
  token: null as string | null,
  expiresAt: 0,

  setToken(token: string, expiresInMs: number) {
    this.token = token;
    this.expiresAt = Date.now() + expiresInMs;
  },

  isValid(tokenToTest: string): boolean {
    if (!this.token || !this.expiresAt) return false;
    if (Date.now() > this.expiresAt) {
      this.token = null; // Clear expired token
      return false;
    }
    return this.token === tokenToTest;
  },

  clear() {
    this.token = null;
    this.expiresAt = 0;
  }
};
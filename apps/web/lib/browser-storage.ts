function safeStorage(kind: 'localStorage' | 'sessionStorage') {
  return {
    getItem(key: string): string | null {
      try {
        return globalThis[kind]?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        globalThis[kind]?.setItem(key, value);
      } catch {}
    },
    removeItem(key: string): void {
      try {
        globalThis[kind]?.removeItem(key);
      } catch {}
    },
  };
}
export const localState = safeStorage('localStorage');
export const sessionState = safeStorage('sessionStorage');

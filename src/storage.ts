// localStorage can throw (private mode, blocked site data), so every access is guarded.

export function loadNumber(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: string | number | boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Not being able to save is fine; the game still works.
  }
}

export function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

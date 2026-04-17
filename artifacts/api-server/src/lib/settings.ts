const store: Record<string, string> = {};

export function getSetting(key: string): string {
  return store[key] ?? process.env[key] ?? '';
}

export function setSetting(key: string, value: string): void {
  store[key] = value;
}

export function getAllSettings(): Record<string, string> {
  return {
    PRINCIPAL_NAME: getSetting('PRINCIPAL_NAME') || 'The Principal',
  };
}

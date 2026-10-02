export function normalizeCode(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/^(?:S\/N|SN)\s*[:#-]?/i, '')
    .replace(/[^A-Z0-9]/g, '');
}

export function classifyCode(raw) {
  const code = normalizeCode(raw);
  if (/^\d{8,9}$/.test(code)) return { type: 'asset', value: code };
  if (/^[A-Z0-9]{12,13}$/.test(code)) return { type: 'serial', value: code };
  return { type: 'invalid', value: code };
}

export function modelHint(serial) {
  return normalizeCode(serial).startsWith('P') ? 'T6' : null;
}
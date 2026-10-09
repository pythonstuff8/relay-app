export type Pairing = {
  host: string;
  port: number;
  token: string;
  name: string;
};

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

function readParams(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of query.split('&')) {
    const [key, value = ''] = part.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return params;
}

// Parses the desktop QR code: relay://pair?host=..&port=..&token=..&name=..&v=1
export function parsePairingUrl(data: string): Pairing | null {
  const match = /^relay:\/\/pair\?(.+)$/i.exec(data.trim());
  if (!match) return null;
  const params = readParams(match[1]);
  const port = Number(params.port);
  const token = normalizeCode(params.token || '');
  if (!IPV4.test(params.host || '') || !Number.isInteger(port) || port <= 0 || port > 65535 || token.length !== 10) {
    return null;
  }
  return { host: params.host, port, token, name: (params.name || 'Computer').slice(0, 60) };
}

// Parses manual entry: "192.168.1.20:8080" plus the 10-character pairing code.
export function parseManualPairing(address: string, code: string): Pairing | null {
  const [host, portText = '8080'] = address.trim().split(':');
  const port = Number(portText);
  const token = normalizeCode(code);
  if (!IPV4.test(host) || !Number.isInteger(port) || port <= 0 || port > 65535 || token.length !== 10) {
    return null;
  }
  return { host, port, token, name: 'Computer' };
}

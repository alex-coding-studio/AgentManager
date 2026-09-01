export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

export class RequestBoundaryError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'RequestBoundaryError';
    this.status = status;
  }
}

export function normalizeHostname(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    if (end < 2) return null;
    const literal = trimmed.slice(0, end + 1).toLowerCase();
    const remainder = trimmed.slice(end + 1);
    if (remainder && !/^:\d+$/.test(remainder)) return null;
    return literal;
  }
  const [hostname, port, ...rest] = trimmed.split(':');
  if (rest.length > 0) return null;
  if (port !== undefined && !/^\d+$/.test(port)) return null;
  if (!hostname) return null;
  return hostname.toLowerCase();
}

function configuredHostnames() {
  return [
    process.env.AGENT_MANAGER_ALLOWED_HOSTS ?? '',
    process.env.AGENT_MANAGER_ALLOWED_DEV_ORIGINS ?? '',
  ]
    .flatMap((value) => value.split(','))
    .map((entry) => normalizeHostname(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function allowedHostnames() {
  return [...new Set([...LOOPBACK_HOSTNAMES, ...configuredHostnames()])];
}

export function isAllowedHost(hostHeader: string | null | undefined) {
  const hostname = normalizeHostname(hostHeader);
  if (!hostname) return false;
  if (hostname === '::1') return true;
  return allowedHostnames().includes(hostname);
}

export function isCrossOriginRequest(
  originHeader: string | null | undefined,
  hostHeader: string | null | undefined,
) {
  const origin = originHeader?.trim();
  if (!origin) return false;
  if (origin === 'null') return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  const host = hostHeader?.trim();
  if (!host) return true;
  return (
    normalizeHostname(originHost) !== normalizeHostname(host) ||
    portOf(originHost) !== portOf(host)
  );
}

function portOf(value: string) {
  const trimmed = value.trim();
  const separator = trimmed.startsWith('[')
    ? trimmed.indexOf(']') + 1
    : trimmed.indexOf(':');
  if (separator <= 0) return '';
  return trimmed.slice(separator).replace(/^:/, '');
}

export function assertTrustedRequest(request: Request) {
  const headers = request.headers;
  if (!isAllowedHost(headers.get('host')))
    throw new RequestBoundaryError('This host is not allowed.', 421);
  if (SAFE_METHODS.has(request.method)) return;
  if (isCrossOriginRequest(headers.get('origin'), headers.get('host')))
    throw new RequestBoundaryError('Cross-origin writes are not allowed.', 403);
}

export function assertJsonRequest(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json')
    throw new RequestBoundaryError(
      'This request must be sent as application/json.',
      415,
    );
}

export function boundaryErrorResponse(error: unknown) {
  if (!(error instanceof RequestBoundaryError)) return null;
  return Response.json({ error: error.message }, { status: error.status });
}

export function guardRequest(request: Request) {
  try {
    assertTrustedRequest(request);
    return null;
  } catch (error) {
    const response = boundaryErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export function guardJsonRequest(request: Request) {
  try {
    assertTrustedRequest(request);
    assertJsonRequest(request);
    return null;
  } catch (error) {
    const response = boundaryErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

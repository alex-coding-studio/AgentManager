import { randomUUID } from 'node:crypto';
import {
  RequestBoundaryError,
  boundaryErrorResponse,
} from './request-boundary.ts';

export class PublicApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = 'PublicApiError';
    this.status = status;
    this.code = code;
  }
}

export function publicError(message: string, status = 400, code?: string) {
  return new PublicApiError(message, status, code);
}

const SECRET_WORDS =
  'authorization|token|password|passwd|secret|credential|credentials|apikey|api[_-]key|access[_-]key|private[_-]key|client[_-]secret|session[_-]key';

const KEY_NAME = `(?:[A-Za-z0-9]+[_.-])*(?:${SECRET_WORDS})(?:[_.-][A-Za-z0-9]+)*`;

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(gh[pousr]_[A-Za-z0-9]{16,})/g, 'gh_[redacted]'],
  [/\b(sk-[A-Za-z0-9_-]{16,})/g, 'sk-[redacted]'],
  [/\b(xox[abprs]-[A-Za-z0-9-]{10,})/g, 'xox-[redacted]'],
  [
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    '[redacted-jwt]',
  ],
  [/\b(bearer)\s+\S+/gi, '$1 [redacted]'],
  [new RegExp(`("${KEY_NAME}"\\s*:\\s*)"[^"]*"`, 'gi'), '$1"[redacted]"'],
  [new RegExp(`('${KEY_NAME}'\\s*:\\s*)'[^']*'`, 'gi'), "$1'[redacted]'"],
  [
    new RegExp(`\\b(${KEY_NAME})(\\s*[:=]\\s*)"[^"]*"`, 'gi'),
    '$1$2"[redacted]"',
  ],
  [
    new RegExp(`\\b(${KEY_NAME})(\\s*[:=]\\s*)'[^']*'`, 'gi'),
    "$1$2'[redacted]'",
  ],
  [new RegExp(`\\b(${KEY_NAME})(\\s*[:=]\\s*)\\S+`, 'gi'), '$1$2[redacted]'],
  [/(--(?:token|password|secret|api-key))(=|\s+)\S+/gi, '$1$2[redacted]'],
];

export function redactSecrets(text: string) {
  return SECRET_PATTERNS.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text,
  );
}

const MAX_CAUSE_DEPTH = 4;

function diagnosticText(
  error: unknown,
  depth = 0,
  seen: Set<unknown> = new Set(),
): string {
  if (!(error instanceof Error)) return String(error);
  if (seen.has(error)) return `${error.name}: <cause cycle>`;
  seen.add(error);
  const head = `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`;
  const cause: unknown = error.cause;
  if (cause === undefined || depth >= MAX_CAUSE_DEPTH) return head;
  return `${head}\ncaused by ${diagnosticText(cause, depth + 1, seen)}`;
}

export function recordUnexpectedApiError(
  correlationId: string,
  route: string,
  error: unknown,
) {
  console.error(
    `[api-error ${correlationId}] ${route}: ${redactSecrets(diagnosticText(error))}`,
  );
}

export function isCancellationError(error: unknown) {
  return (
    error instanceof Error &&
    ('code' in error || error.message.toLowerCase().includes('cancel'))
  );
}

export function apiErrorResponse(
  error: unknown,
  fallbackMessage: string,
  route: string,
) {
  const boundary = boundaryErrorResponse(error);
  if (boundary) return boundary;
  if (error instanceof PublicApiError)
    return Response.json(
      error.code
        ? { error: error.message, code: error.code }
        : { error: error.message },
      { status: error.status },
    );
  const correlationId = randomUUID().replaceAll('-', '').slice(0, 12);
  recordUnexpectedApiError(correlationId, route, error);
  return Response.json(
    { error: fallbackMessage, correlationId },
    { status: 500 },
  );
}

export function isRequestBoundaryError(error: unknown) {
  return error instanceof RequestBoundaryError;
}

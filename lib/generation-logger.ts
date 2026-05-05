type LogValue = string | number | boolean | null | undefined;
type LogDetails = Record<string, LogValue>;

export interface GenerationLogger {
  requestId: string;
  info: (step: string, details?: LogDetails) => void;
  error: (step: string, error: unknown, details?: LogDetails) => void;
}

export function createGenerationLogger(scope: string, requestId = createRequestId()): GenerationLogger {
  const startedAt = Date.now();

  return {
    requestId,
    info(step, details = {}) {
      console.info(formatMessage(scope, step), formatDetails(requestId, startedAt, details));
    },
    error(step, error, details = {}) {
      console.error(formatMessage(scope, step), {
        ...formatDetails(requestId, startedAt, details),
        error: error instanceof Error ? error.message : String(error),
      });
    },
  };
}

export function summarizeForLog(value: string | undefined, maxLength = 80) {
  if (!value) return undefined;

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function createRequestId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `gen_${Date.now().toString(36)}_${random}`;
}

function formatMessage(scope: string, step: string) {
  return `[generation:${scope}] ${step}`;
}

function formatDetails(requestId: string, startedAt: number, details: LogDetails) {
  return {
    requestId,
    elapsedMs: Date.now() - startedAt,
    ...Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined)),
  };
}

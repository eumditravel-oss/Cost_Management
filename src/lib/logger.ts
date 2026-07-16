const sensitiveKeyPattern =
  /password|secret|token|authorization|cookie|account|resident|phone/i;

export type LogFields = Record<string, unknown>;

function redact(fields: LogFields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[REDACTED]" : value,
    ]),
  );
}

export const logger = {
  error(message: string, fields: LogFields = {}) {
    console.error(JSON.stringify({ level: "error", message, ...redact(fields) }));
  },
  info(message: string, fields: LogFields = {}) {
    console.info(JSON.stringify({ level: "info", message, ...redact(fields) }));
  },
};

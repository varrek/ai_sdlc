export function redactUntrustedText(message: string): string {
  return message
    .replace(/https?:\/\/[^@\s]+@/g, "https://<redacted>@")
    .replace(/[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+-]+@/g, "<redacted>@")
    .replace(/(token|secret|password|api[_-]?key)=([^&\s]+)/gi, "$1=<redacted>")
    .slice(0, 2000);
}

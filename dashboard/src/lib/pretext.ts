export function pretextCompact(value: string, maxChars = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

export function pretextWords(value: string, maxWords = 18): string {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= maxWords) {
    return words.join(" ");
  }

  return `${words.slice(0, maxWords).join(" ")}…`;
}

export function pretextCount(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Math.max(0, value),
  );
}

export function resolveOllamaApiBase(configuredBaseUrl: string): string {
  const trimmed = configuredBaseUrl.replace(/\/+$/, "");
  return trimmed.replace(/\/v1$/i, "");
}

export async function fetchOllamaModels(baseUrl: string) {
  try {
    const apiBase = resolveOllamaApiBase(baseUrl);
    const response = await fetch(`${apiBase}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { models?: { name: string }[] };
    return data.models?.map(m => m.name) ?? [];
  } catch (err) {
    console.error("Error fetching Ollama models:", err);
    return [];
  }
}

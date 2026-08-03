export async function downloadFromEndpoint(
  url: string,
  filename: string,
): Promise<void> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = (data as Record<string, unknown>).error;
    throw new Error(
      typeof message === "string" ? message : "Errore durante il download",
    );
  }

  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
}

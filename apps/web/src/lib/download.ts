import { TOKEN_KEY } from "./api";
import { errorMessageFromResponse } from "./errors";

export async function downloadFromEndpoint(
  url: string,
  filename: string,
): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(
      await errorMessageFromResponse(response, "errors.download_failed"),
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


export function getTelegramWebApp() {
  try {
    return window.Telegram?.WebApp || null;
  } catch {
    return null;
  }
}

export function openExternalLink(url) {
  if (!url) return;

  const tg = getTelegramWebApp();

  try {
    if (tg?.openLink) {
      tg.openLink(url, {
        try_instant_view: false
      });
      return;
    }
  } catch (error) {
    console.error("Telegram openLink error:", error);
  }

  // Если магазин открыт не в Telegram
  window.location.href = url;
}

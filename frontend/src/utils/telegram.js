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
      if (/^https?:\/\/(t\.me|telegram\.me)\//i.test(url) && tg.openTelegramLink) {
        tg.openTelegramLink(url);
      } else {
        tg.openLink(url);
      }
      return;
    }
  } catch {
    // fallback below
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

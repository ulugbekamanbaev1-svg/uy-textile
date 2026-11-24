import { Heart, Moon, ShoppingBag, Sun } from "lucide-react";

import { LANGUAGES } from "../i18n";
import { assetUrl } from "../services/api";

export default function TopBar({
  t,
  lang,
  setLang,
  theme,
  onToggleTheme,
  cartCount,
  onCart,
  onHome,
  storeSettings,
  onShowLocation
}) {
  const logoUrl = storeSettings?.logo_url ? assetUrl(storeSettings.logo_url) : "";
  const storeName = storeSettings?.store_name || "Farrux shop (Hozorosp)";
  const nextThemeLabel = theme === "dark" ? t("themeLight") : t("themeDark");

  return (
    <header className="header top-bar">
      <button
        className="brand brand-button"
        type="button"
        onClick={onShowLocation || onHome}
        aria-label={t("storeLocationTitle") || storeName}
      >
        <span className={`brand-icon${logoUrl ? " has-image" : ""}`}>
          {logoUrl ? <img src={logoUrl} alt={storeName} /> : "F"}
        </span>
        <span className="brand-text">
          <span className="brand-title">{storeName.toUpperCase()}</span>
          <span className="brand-subtitle">{t("tagline")}</span>
        </span>
      </button>

      <div className="header-actions">
        <button
          className="icon-button theme-toggle"
          type="button"
          aria-label={nextThemeLabel}
          title={nextThemeLabel}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="language-switch" role="group" aria-label={t("language")}>
          {Object.entries(LANGUAGES).map(([code, item]) => (
            <button
              key={code}
              type="button"
              title={item.name}
              className={lang === code ? "active" : ""}
              onClick={() => setLang(code)}
            >
              {item.short}
            </button>
          ))}
        </div>

        <button
          className="icon-button cart-icon-button"
          type="button"
          aria-label={t("navCart")}
          onClick={onCart}
        >
          <ShoppingBag size={20} />
          {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
        </button>
      </div>
    </header>
  );
}

export function FavoriteButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      className={`favorite-button${active ? " active" : ""}`}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        try {
          window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
        } catch {
          // ignore
        }
        onClick();
      }}
    >
      <Heart size={17} />
    </button>
  );
}

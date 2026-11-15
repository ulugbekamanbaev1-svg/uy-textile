import { Heart, ShoppingBag } from "lucide-react";

import { LANGUAGES } from "../i18n";

export default function TopBar({
  t,
  lang,
  setLang,
  cartCount,
  onCart,
  onHome
}) {
  return (
    <header className="header top-bar">
      <button className="brand brand-button" type="button" onClick={onHome}>
        <span className="brand-icon">U</span>
        <span className="brand-text">
          <span className="brand-title">UY TEXTILE</span>
          <span className="brand-subtitle">{t("tagline")}</span>
        </span>
      </button>

      <div className="header-actions">
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
        onClick();
      }}
    >
      <Heart size={17} />
    </button>
  );
}

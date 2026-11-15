import { useEffect, useState } from "react";
import {
  Clock,
  CreditCard,
  Heart,
  Instagram,
  MapPin,
  Phone,
  Send,
  ShoppingBag,
  Truck,
  Wifi,
  WifiOff
} from "lucide-react";

import { LANGUAGES } from "../i18n";
import { fetchStoreSettings } from "../services/api";
import { formatPrice } from "../utils/format";

function socialHandle(value) {
  return (value || "")
    .replace(/^@/, "")
    .replace(/^https?:\/\/(t\.me|instagram\.com)\//i, "")
    .replace(/\/$/, "");
}

export default function ProfilePage({
  t,
  lang,
  setLang,
  telegramUser,
  authState,
  server,
  cartCount,
  cartTotal,
  favoritesCount,
  onCart,
  onFavorites
}) {
  const [store, setStore] = useState(null);

  useEffect(() => {
    fetchStoreSettings()
      .then(setStore)
      .catch(() => setStore(null));
  }, []);

  const hasContacts =
    store &&
    (store.phone ||
      store.address ||
      store.working_hours ||
      store.delivery_info ||
      store.payment_info ||
      store.instagram ||
      store.telegram);

  return (
    <main>
      <div className="page-heading">
        <span className="eyebrow">UY TEXTILE</span>
        <h2>{t("profileTitle")}</h2>
      </div>

      <section className="profile-card">
        <div className="profile-avatar">
          {telegramUser?.first_name?.[0]?.toUpperCase() || "U"}
        </div>
        <div>
          <h3>
            {telegramUser
              ? `${telegramUser.first_name || ""} ${
                  telegramUser.last_name || ""
                }`.trim()
              : t("profileGuest")}
          </h3>
          <p>
            {telegramUser?.username
              ? `@${telegramUser.username}`
              : t("profileTelegram")}
          </p>
          {authState === "error" && <p>{t("authError")}</p>}
          {authState === "ok" && telegramUser && (
            <p>{t("greeting", { name: telegramUser.first_name })}</p>
          )}
        </div>
      </section>

      {hasContacts && (
        <section className="profile-section">
          <h3>{t("contactsTitle")}</h3>

          <div className="contact-list">
            {store.phone && (
              <a className="contact-row" href={`tel:${store.phone}`}>
                <Phone size={16} />
                <span>{t("contactPhone")}</span>
                <strong>{store.phone}</strong>
              </a>
            )}

            {store.address && (
              <div className="contact-row">
                <MapPin size={16} />
                <span>{t("contactAddress")}</span>
                <strong>{store.address}</strong>
              </div>
            )}

            {store.working_hours && (
              <div className="contact-row">
                <Clock size={16} />
                <span>{t("contactHours")}</span>
                <strong>{store.working_hours}</strong>
              </div>
            )}

            {store.telegram && (
              <a
                className="contact-row"
                href={`https://t.me/${socialHandle(store.telegram)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Send size={16} />
                <span>{t("contactTelegram")}</span>
                <strong>{store.telegram}</strong>
              </a>
            )}

            {store.instagram && (
              <a
                className="contact-row"
                href={`https://instagram.com/${socialHandle(store.instagram)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Instagram size={16} />
                <span>{t("contactInstagram")}</span>
                <strong>{store.instagram}</strong>
              </a>
            )}
          </div>

          {store.delivery_info && (
            <div className="contact-note">
              <Truck size={16} />
              <div>
                <span>{t("contactDelivery")}</span>
                <p>{store.delivery_info}</p>
              </div>
            </div>
          )}

          {store.payment_info && (
            <div className="contact-note">
              <CreditCard size={16} />
              <div>
                <span>{t("contactPayment")}</span>
                <p>{store.payment_info}</p>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="profile-section">
        <h3>{t("language")}</h3>
        <p className="option-hint">{t("languageHint")}</p>

        <div className="language-list">
          {Object.entries(LANGUAGES).map(([code, item]) => (
            <button
              key={code}
              type="button"
              className={lang === code ? "active" : ""}
              onClick={() => setLang(code)}
            >
              <span>{item.name}</span>
              <span className="language-code">{item.short}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="profile-section">
        <div className="profile-link" onClick={onCart} role="button" tabIndex={0}>
          <ShoppingBag size={18} />
          <span>{t("cartTitle")}</span>
          <strong>{t("itemsCount", { count: cartCount })}</strong>
        </div>
        <div className="profile-link-row">
          <span>{t("subtotal")}</span>
          <strong>{formatPrice(cartTotal, lang)}</strong>
        </div>

        <div
          className="profile-link"
          onClick={onFavorites}
          role="button"
          tabIndex={0}
        >
          <Heart size={18} />
          <span>{t("favoritesTitle")}</span>
          <strong>{favoritesCount}</strong>
        </div>
      </section>

      <section className="profile-section">
        <h3>{t("serverStatus")}</h3>
        <div className="connection-status">
          {server === "online" ? (
            <>
              <Wifi size={18} color="#16a34a" />
              <span>{t("serverOnline")}</span>
            </>
          ) : server === "offline" ? (
            <>
              <WifiOff size={18} color="#dc2626" />
              <span>{t("serverOffline")}</span>
            </>
          ) : (
            <span>{t("serverChecking")}</span>
          )}
        </div>
      </section>
    </main>
  );
}

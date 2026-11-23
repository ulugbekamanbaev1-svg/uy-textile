
import { useEffect, useState } from "react";
import {
  Clock,
  CreditCard,
  Download,
  Heart,
  Instagram,
  MapPin,
  PackageSearch,
  Phone,
  Send,
  ShoppingBag,
  Smartphone,
  Truck,
  Wifi,
  WifiOff,
  X
} from "lucide-react";

import { LANGUAGES } from "../i18n";
import { fetchStoreSettings } from "../services/api";
import { formatPrice } from "../utils/format";
import { openExternalLink } from "../utils/telegram";

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
  onFavorites,
  onOrders
}) {
  const [store, setStore] = useState(null);

  // PWA установка
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    fetchStoreSettings()
      .then(setStore)
      .catch(() => setStore(null));
  }, []);

  // Проверяем возможность установки приложения
  useEffect(() => {
    const checkInstalled = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;

      setIsInstalled(standalone);
    };

    checkInstalled();

    const handleBeforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setShowInstallHelp(false);
    };

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstall
    );

    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstall
      );

      window.removeEventListener(
        "appinstalled",
        handleInstalled
      );
    };
  }, []);

  const handleInstallApp = async () => {
    if (isInstalled) return;

    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }

    try {
      await installPrompt.prompt();

      const result = await installPrompt.userChoice;

      if (result.outcome === "accepted") {
        setShowInstallHelp(false);
      }

      setInstallPrompt(null);
    } catch (error) {
      console.error("PWA installation error:", error);
      setShowInstallHelp(true);
    }
  };

const openInBrowser = () => {
  openExternalLink("https://uy-textile-frontend.onrender.com");
};

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

      {/* Установка Farrux Shop */}
      <section className="profile-section pwa-install-card">
        <div className="pwa-install-info">
          <div className="pwa-install-icon">
            <Smartphone size={25} />
          </div>

          <div>
            <h3>Farrux Shop — приложение</h3>

            <p className="option-hint">
              Установите магазин на главный экран телефона
              и открывайте его в любое время.
            </p>
          </div>
        </div>

        {isInstalled ? (
          <div className="pwa-installed">
            <Smartphone size={18} />
            Приложение уже установлено
          </div>
        ) : (
          <button
            type="button"
            className="primary-button pwa-install-button"
            onClick={handleInstallApp}
          >
            <Download size={18} />
            Установить приложение
          </button>
        )}
      </section>

      {/* Контакты магазина */}
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
                onClick={(e) => {
                  e.preventDefault();
                  openExternalLink(
                    `https://t.me/${socialHandle(store.telegram)}`
                  );
                }}
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
                onClick={(e) => {
                  e.preventDefault();
                  openExternalLink(
                    `https://instagram.com/${socialHandle(store.instagram)}`
                  );
                }}
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

      {/* Мои заказы */}
      <section className="profile-section">
        <div
          className="profile-link"
          onClick={onOrders}
          role="button"
          tabIndex={0}
        >
          <PackageSearch size={18} />
          <span>{t("navOrders")}</span>
          <strong>{t("trackOrdersButton")}</strong>
        </div>
      </section>

      {/* Язык */}
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

      {/* Корзина и избранное */}
      <section className="profile-section">
        <div
          className="profile-link"
          onClick={onCart}
          role="button"
          tabIndex={0}
        >
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

      {/* Статус сервера */}
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

      {/* Инструкция установки */}
      {showInstallHelp && (
        <div
          className="pwa-help-overlay"
          onClick={() => setShowInstallHelp(false)}
        >
          <div
            className="pwa-help-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="pwa-help-close"
              onClick={() => setShowInstallHelp(false)}
            >
              <X size={20} />
            </button>

            <Smartphone size={32} />

            <h3>Установка Farrux Shop</h3>

            <p>
              <strong>Android:</strong> откройте магазин в Google Chrome,
              нажмите меню ⋮ и выберите «Установить приложение»
              или «Добавить на главный экран».
            </p>

            <p>
              <strong>iPhone:</strong> откройте магазин в Safari,
              нажмите «Поделиться», затем «На экран Домой».
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={openInBrowser}
            >
              Открыть магазин в браузере
            </button>

            <button
              type="button"
              className="pwa-help-secondary"
              onClick={() => setShowInstallHelp(false)}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

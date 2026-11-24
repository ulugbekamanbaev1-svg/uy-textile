
import { useEffect, useState } from "react";
import {
  Clock,
  CreditCard,
  Download,
  Instagram,
  MapPin,
  PackageSearch,
  Phone,
  Send,
  Smartphone,
  Truck,
  Wifi,
  WifiOff,
  X
} from "lucide-react";

import { fetchStoreSettings } from "../services/api";
import { openExternalLink } from "../utils/telegram";
import ReferralSection from "../components/ReferralSection";
import VipCard from "../components/VipCard";

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
        <span className="eyebrow">FARRUX SHOP</span>
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

      <VipCard t={t} lang={lang} />

      <ReferralSection t={t} lang={lang} />

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

      <section className="profile-section pwa-install-card">
        <div className="pwa-install-info">
          <div className="pwa-install-icon">
            <Smartphone size={25} />
          </div>

          <div>
            <h3>Farrux Shop — ilova</h3>
            <p className="option-hint">
              Do'konni telefoningiz bosh ekraniga o'rnating va istalgan vaqtda oching.
            </p>
          </div>
        </div>

        {isInstalled ? (
          <div className="pwa-installed">
            <Smartphone size={18} />
            Ilova allaqachon o'rnatilgan
          </div>
        ) : (
          <button
            type="button"
            className="primary-button pwa-install-button"
            onClick={handleInstallApp}
          >
            <Download size={18} />
            Ilovani o'rnatish
          </button>
        )}
      </section>

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
            <h3>Farrux Shop ilovasini o'rnatish</h3>

            <p>
              <strong>Android:</strong> do'konni Google Chrome'da oching,
              ⋮ menyusini bosing va "Ilovani o'rnatish" yoki
              "Bosh ekranga qo'shish"ni tanlang.
            </p>

            <p>
              <strong>iPhone:</strong> do'konni Safari'da oching,
              "Ulashish" tugmasini bosing, so'ng "Bosh ekranga qo'shish"ni tanlang.
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={openInBrowser}
            >
              Do'konni brauzerda ochish
            </button>

            <button
              type="button"
              className="pwa-help-secondary"
              onClick={() => setShowInstallHelp(false)}
            >
              Yopish
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

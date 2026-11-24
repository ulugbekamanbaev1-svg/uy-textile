import { useEffect, useState } from "react";
import {
  BadgeDollarSign,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  Instagram,
  MapPin,
  PackageSearch,
  Phone,
  Send,
  Smartphone,
  Sparkles,
  Truck,
  Users,
  Wifi,
  WifiOff,
  X
} from "lucide-react";

import { fetchStoreSettings } from "../services/api";
import { openExternalLink } from "../utils/telegram";
import ReferralSection from "../components/ReferralSection";
import VipCard from "../components/VipCard";
import "./ProfilePage.css";

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
  onOrders,
  onCurrency,
  onGroupPurchase
}) {
  const [store, setStore] = useState(null);

  // PWA установка
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    fetchStoreSettings()
      .then(setStore)
      .catch(() => setStore(null));
  }, []);

  useEffect(() => {
    setAvatarError(false);
  }, [telegramUser?.photo_url]);

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

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
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
    // Prefer the current origin so the link keeps working on any domain.
    const origin = window.location.origin;
    const target =
      /^https?:\/\//.test(origin) && !/localhost|127\.0\.0\.1/.test(origin)
        ? origin
        : "https://uy-textile-frontend.onrender.com";

    openExternalLink(target);
  };

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (!element) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    element.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start"
    });
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

  const fullName = telegramUser
    ? `${telegramUser.first_name || ""} ${telegramUser.last_name || ""}`.trim()
    : "";

  const avatarInitial = (
    telegramUser?.first_name?.[0] ||
    telegramUser?.username?.[0] ||
    "U"
  ).toUpperCase();

  const photoUrl = telegramUser?.photo_url || "";

  return (
    <main className="profile-page">
      <div className="page-heading">
        <span className="eyebrow">FARRUX SHOP</span>
        <h2>{t("profileTitle")}</h2>
      </div>

      <section className="lux-card lux-profile-card">
        <div className="lux-avatar" aria-hidden="true">
          {photoUrl && !avatarError ? (
            <img
              src={photoUrl}
              alt=""
              loading="lazy"
              onError={() => setAvatarError(true)}
            />
          ) : (
            avatarInitial
          )}
        </div>

        <div className="lux-profile-body">
          <h3 className="lux-profile-name">
            {telegramUser ? fullName || t("profileGuest") : t("profileGuest")}
          </h3>

          <span className="lux-profile-username">
            {telegramUser?.username
              ? `@${telegramUser.username}`
              : t("profileTelegram")}
          </span>

          {authState === "ok" && telegramUser && (
            <p className="lux-profile-greeting">
              {t("greeting", { name: telegramUser.first_name || fullName })}
            </p>
          )}

          {authState === "error" && (
            <p className="lux-auth-error">{t("authError")}</p>
          )}
        </div>
      </section>

      <VipCard t={t} lang={lang} />

      <ReferralSection t={t} lang={lang} />

      <section className="lux-card lux-quick">
        <div className="lux-section-head">
          <span className="lux-icon">
            <Sparkles size={18} />
          </span>
          <div>
            <h3>{t("profileQuickTitle")}</h3>
          </div>
        </div>

        <button
          type="button"
          className="lux-quick-row"
          onClick={onOrders}
        >
          <span className="lux-quick-icon">
            <PackageSearch size={18} />
          </span>
          <span className="lux-quick-text">
            <strong>{t("navOrders")}</strong>
            <small>{t("profileQuickOrdersHint")}</small>
          </span>
          <ChevronRight size={18} className="lux-quick-arrow" />
        </button>

        <button
          type="button"
          className="lux-quick-row"
          onClick={onCurrency}
        >
          <span className="lux-quick-icon">
            <BadgeDollarSign size={18} />
          </span>
          <span className="lux-quick-text">
            <strong>{t("currencyTitle")}</strong>
            <small>{t("currencyProfileHint")}</small>
          </span>
          <ChevronRight size={18} className="lux-quick-arrow" />
        </button>

        <button
          type="button"
          className="lux-quick-row"
          onClick={onGroupPurchase}
        >
          <span className="lux-quick-icon">
            <Users size={18} />
          </span>
          <span className="lux-quick-text">
            <strong>{t("gpTitle")}</strong>
            <small>{t("gpProfileHint")}</small>
          </span>
          <ChevronRight size={18} className="lux-quick-arrow" />
        </button>

        {hasContacts && (
          <button
            type="button"
            className="lux-quick-row"
            onClick={() => scrollToSection("profile-contacts")}
          >
            <span className="lux-quick-icon">
              <MapPin size={18} />
            </span>
            <span className="lux-quick-text">
              <strong>{t("contactsTitle")}</strong>
              <small>{t("profileQuickContactsHint")}</small>
            </span>
            <ChevronRight size={18} className="lux-quick-arrow" />
          </button>
        )}

        <button
          type="button"
          className="lux-quick-row"
          onClick={() => scrollToSection("profile-install")}
        >
          <span className="lux-quick-icon">
            <Smartphone size={18} />
          </span>
          <span className="lux-quick-text">
            <strong>{t("appInstallTitle")}</strong>
            <small>{t("profileQuickAppHint")}</small>
          </span>
          <ChevronRight size={18} className="lux-quick-arrow" />
        </button>
      </section>

      {hasContacts && (
        <section id="profile-contacts" className="lux-card lux-contacts">
          <div className="lux-section-head">
            <span className="lux-icon">
              <MapPin size={18} />
            </span>
            <div>
              <h3>{t("contactsTitle")}</h3>
              <p>{t("contactsSubtitle")}</p>
            </div>
          </div>

          <div className="lux-contact-list">
            {store.phone && (
              <a className="lux-contact-row" href={`tel:${store.phone}`}>
                <span className="lux-contact-icon">
                  <Phone size={15} />
                </span>
                <span className="lux-contact-body">
                  <span className="lux-contact-label">{t("contactPhone")}</span>
                  <span className="lux-contact-value">{store.phone}</span>
                </span>
                <ChevronRight size={15} className="lux-contact-arrow" />
              </a>
            )}

            {store.address && (
              <div className="lux-contact-row">
                <span className="lux-contact-icon">
                  <MapPin size={15} />
                </span>
                <span className="lux-contact-body">
                  <span className="lux-contact-label">{t("contactAddress")}</span>
                  <span className="lux-contact-value">{store.address}</span>
                </span>
              </div>
            )}

            {store.working_hours && (
              <div className="lux-contact-row">
                <span className="lux-contact-icon">
                  <Clock size={15} />
                </span>
                <span className="lux-contact-body">
                  <span className="lux-contact-label">{t("contactHours")}</span>
                  <span className="lux-contact-value">{store.working_hours}</span>
                </span>
              </div>
            )}

            {store.telegram && (
              <a
                className="lux-contact-row"
                href={`https://t.me/${socialHandle(store.telegram)}`}
                onClick={(e) => {
                  e.preventDefault();
                  openExternalLink(
                    `https://t.me/${socialHandle(store.telegram)}`
                  );
                }}
              >
                <span className="lux-contact-icon">
                  <Send size={15} />
                </span>
                <span className="lux-contact-body">
                  <span className="lux-contact-label">{t("contactTelegram")}</span>
                  <span className="lux-contact-value">{store.telegram}</span>
                </span>
                <ChevronRight size={15} className="lux-contact-arrow" />
              </a>
            )}

            {store.instagram && (
              <a
                className="lux-contact-row"
                href={`https://instagram.com/${socialHandle(store.instagram)}`}
                onClick={(e) => {
                  e.preventDefault();
                  openExternalLink(
                    `https://instagram.com/${socialHandle(store.instagram)}`
                  );
                }}
              >
                <span className="lux-contact-icon">
                  <Instagram size={15} />
                </span>
                <span className="lux-contact-body">
                  <span className="lux-contact-label">{t("contactInstagram")}</span>
                  <span className="lux-contact-value">{store.instagram}</span>
                </span>
                <ChevronRight size={15} className="lux-contact-arrow" />
              </a>
            )}
          </div>

          {store.delivery_info && (
            <div className="lux-note">
              <span className="lux-contact-icon">
                <Truck size={15} />
              </span>
              <div>
                <span className="lux-contact-label">{t("contactDelivery")}</span>
                <p>{store.delivery_info}</p>
              </div>
            </div>
          )}

          {store.payment_info && (
            <div className="lux-note">
              <span className="lux-contact-icon">
                <CreditCard size={15} />
              </span>
              <div>
                <span className="lux-contact-label">{t("contactPayment")}</span>
                <p>{store.payment_info}</p>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="lux-card lux-server">
        <div className="lux-section-head">
          <span className="lux-icon">
            {server === "offline" ? <WifiOff size={18} /> : <Wifi size={18} />}
          </span>
          <div>
            <h3>{t("serverStatus")}</h3>
            <p>{t("serverStatusHint")}</p>
          </div>
        </div>

        <div className="lux-server-state">
          <span className={`lux-status-dot ${server}`} aria-hidden="true" />
          <strong>
            {server === "online"
              ? t("serverOnline")
              : server === "offline"
                ? t("serverOffline")
                : t("serverChecking")}
          </strong>
        </div>
      </section>

      <section id="profile-install" className="lux-card lux-install">
        <div className="lux-install-head">
          <span className="lux-icon">
            <Smartphone size={19} />
          </span>
          <div>
            <h3>{t("appInstallTitle")}</h3>
            <p>{t("appInstallText")}</p>
          </div>
        </div>

        {isInstalled ? (
          <div className="lux-installed">
            <Smartphone size={16} />
            {t("appInstalled")}
          </div>
        ) : (
          <button
            type="button"
            className="primary-button lux-gold-button"
            onClick={handleInstallApp}
          >
            <Download size={18} />
            {t("appInstallButton")}
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
              aria-label={t("close")}
            >
              <X size={20} />
            </button>

            <Smartphone size={32} />
            <h3>{t("appInstallHelpTitle")}</h3>

            <p>
              <strong>Android:</strong> {t("appInstallAndroid")}
            </p>

            <p>
              <strong>iPhone:</strong> {t("appInstallIphone")}
            </p>

            <button
              type="button"
              className="primary-button lux-gold-button"
              onClick={openInBrowser}
            >
              {t("appOpenInBrowser")}
            </button>

            <button
              type="button"
              className="pwa-help-secondary"
              onClick={() => setShowInstallHelp(false)}
            >
              {t("close")}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

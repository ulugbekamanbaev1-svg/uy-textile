import { useEffect, useState } from "react";
import {
  BadgeDollarSign,
  BookOpen,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  Instagram,
  MapPin,
  PackageSearch,
  Phone,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  Users,
  Wifi,
  WifiOff,
  X
} from "lucide-react";

import { fetchStoreSettings } from "../services/api";
import visitorTracker from "../services/visitorTracker";
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
}) {
  const [store, setStore] = useState(null);

  // PWA установка
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() =>
    visitorTracker.isEnabled()
  );

  const handleAnalyticsToggle = async () => {
    const next = !analyticsEnabled;
    setAnalyticsEnabled(next);
    await visitorTracker.setConsent(next);
  };

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

      <section className="lux-card lux-privacy">
        <div className="lux-section-head">
          <span className="lux-icon">
            <ShieldCheck size={18} />
          </span>
          <div>
            <h3>{t("privacyTitle")}</h3>
            <p>{t("privacyAnalyticsHint")}</p>
          </div>
        </div>

        <div className="privacy-row">
          <span>{t("privacyAnalytics")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={analyticsEnabled}
            aria-label={t("privacyAnalytics")}
            className={`privacy-switch${analyticsEnabled ? " on" : ""}`}
            onClick={handleAnalyticsToggle}
          >
            <span className="privacy-knob" />
          </button>
        </div>

        <small className="privacy-state">
          {analyticsEnabled ? t("privacyOn") : t("privacyOff")}
        </small>
      </section>

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
          onClick={() => setShowTutorial(true)}
        >
          <span className="lux-quick-icon">
            <BookOpen size={18} />
          </span>
          <span className="lux-quick-text">
            <strong>{t("tutorialTitle")}</strong>
            <small>{t("profileQuickTutorialHint")}</small>
          </span>
          <ChevronRight size={18} className="lux-quick-arrow" />
        </button>

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
    
      {showTutorial && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:1200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={() => setShowTutorial(false)}>
          <div className="lux-card" style={{maxWidth:520,width:'100%',maxHeight:'80vh',overflowY:'auto',padding:20}} onClick={(e)=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:12}}>
              <h3 style={{margin:0}}>{t("tutorialTitle")}</h3>
              <button type="button" onClick={() => setShowTutorial(false)} style={{border:'none',background:'transparent',fontSize:22,cursor:'pointer',lineHeight:1}}>?</button>
            </div>
            <div style={{display:'grid',gap:14}}>
              <div>
                <strong>{t("tutorialStatusTitle")}</strong>
                <p style={{margin:'6px 0 0',color:'var(--lux-text-2,#555)',lineHeight:1.5}}>{t("tutorialStatusText")}</p>
              </div>
              <div>
                <strong>{t("tutorialReferralTitle")}</strong>
                <p style={{margin:'6px 0 0',color:'var(--lux-text-2,#555)',lineHeight:1.5}}>{t("tutorialReferralText")}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

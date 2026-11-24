import { useCallback, useEffect, useState } from "react";
import { Clock, CreditCard, Instagram, MapPin, Phone, Send, Truck, X } from "lucide-react";

import BottomNav from "./components/BottomNav";
import StoreMap from "./components/StoreMap";
import TopBar from "./components/TopBar";
import { openExternalLink } from "./utils/telegram";
import { useCart } from "./hooks/useCart";
import { useFavorites } from "./hooks/useFavorites";
import { LANGUAGES, detectLanguage, translations } from "./i18n";
import CartPage from "./pages/CartPage";
import CatalogPage from "./pages/CatalogPage";
import CheckoutPage from "./pages/CheckoutPage";
import FavoritesPage from "./pages/FavoritesPage";
import HomePage from "./pages/HomePage";
import ProductPage from "./pages/ProductPage";
import ProfilePage from "./pages/ProfilePage";
import OrdersPage from "./pages/OrdersPage";
import CurrencyPage from "./pages/CurrencyPage";
import {
  attachReferral,
  checkServer,
  fetchCategories,
  fetchProducts,
  fetchStoreSettings,
  sendQrMiniAppOpen,
  telegramLogin
} from "./services/api";

const INITIAL_ROUTE = { page: "home", slug: null, category: "" };

const THEME_KEY = "uy_theme";

function detectTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    // localStorage may be unavailable
  }

  const scheme = window.Telegram?.WebApp?.colorScheme;
  if (scheme === "light" || scheme === "dark") {
    return scheme;
  }

  try {
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch {
    // matchMedia may be unavailable
  }

  return "dark";
}

export default function App() {
  const [route, setRoute] = useState(INITIAL_ROUTE);
  const [lang, setLang] = useState(detectLanguage);
  const [theme, setTheme] = useState(detectTheme);
  const [server, setServer] = useState("checking");
  const [telegramUser, setTelegramUser] = useState(null);
  const [authState, setAuthState] = useState("idle");
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [storeSettings, setStoreSettings] = useState(null);
  const [catalogState, setCatalogState] = useState("loading");
  const [showStoreLocation, setShowStoreLocation] = useState(false);

  const cart = useCart();
  const favorites = useFavorites();

  const t = useCallback(
    (key, vars = {}) => {
      const dictionary = translations[lang] || translations.ru;
      let text = dictionary[key] ?? translations.ru[key] ?? key;

      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }

      return text;
    },
    [lang]
  );

  const navigate = useCallback((page, options = {}) => {
    setRoute({ page, slug: options.slug ?? null, category: options.category ?? "" });
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("uy_lang", lang);
    } catch {
      // localStorage может быть недоступен
    }

    document.documentElement.lang = lang === "uzc" ? "uz-Cyrl" : lang;
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    const background = theme === "dark" ? "#0b0c0e" : "#f3ecdf";

    root.dataset.theme = theme;
    root.style.colorScheme = theme;

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", background);

    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // localStorage may be unavailable
    }

    const tg = window.Telegram?.WebApp;
    try {
      tg?.setHeaderColor?.(background);
      tg?.setBackgroundColor?.(background);
    } catch {
      // ignore Telegram theming errors
    }
  }, [theme]);

  const loadCatalog = useCallback(() => {
    setCatalogState("loading");

    Promise.all([fetchCategories(), fetchProducts()])
      .then(([categoryList, productList]) => {
        setCategories(categoryList);
        setProducts(productList);
        setCatalogState("ready");
      })
      .catch(() => setCatalogState("error"));
  }, []);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (tg) {
      tg.ready();
      tg.expand();

      const user = tg.initDataUnsafe?.user;
      if (user) {
        setTelegramUser(user);
      }

      if (tg.initData) {
        telegramLogin(tg.initData)
          .then((data) => {
            // Keep the real Telegram profile fields (photo, last name, telegram id)
            // while refreshing the fields returned by the backend.
            setTelegramUser((previous) => ({
              ...(data.user || {}),
              ...(previous || {}),
              first_name: data.user?.first_name || previous?.first_name,
              username: data.user?.username || previous?.username
            }));
            setAuthState("ok");
          })
          .catch(() => setAuthState("error"));
      }
    }

    checkServer()
      .then(() => setServer("online"))
      .catch(() => setServer("offline"));

    loadCatalog();

    const startParam =
      tg?.initDataUnsafe?.start_param ||
      new URLSearchParams(window.location.search).get("startapp") ||
      "";
    if (startParam.startsWith("qr_")) {
      sendQrMiniAppOpen(startParam);
    } else {
      sendQrMiniAppOpen("");
    }
    if (startParam.startsWith("ref_")) {
      attachReferral(startParam.slice(4)).catch(() => {});
    }
    if (startParam === "cart") {
      navigate("cart");
    } else if (startParam.startsWith("product_")) {
      navigate("product", { slug: startParam.slice("product_".length) });
    } else if (startParam.startsWith("buy_")) {
      navigate("product", { slug: startParam.slice("buy_".length) });
    }

    fetchStoreSettings()
      .then(setStoreSettings)
      .catch(() => setStoreSettings(null));
  }, [loadCatalog]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const backButton = tg?.BackButton;

    if (!backButton || !tg.isVersionAtLeast?.("6.1")) {
      return undefined;
    }

    const showBack = route.page === "product" || route.page === "currency";
    if (showBack) {
      backButton.show();
    } else {
      backButton.hide();
    }

    const handleBack = () => {
      if (route.page === "currency") {
        navigate("profile");
        return;
      }
      navigate("catalog", { category: route.category });
    };

    backButton.onClick(handleBack);
    return () => backButton.offClick(handleBack);
  }, [route.page, route.category, navigate]);

  const openProduct = (slug) =>
    navigate("product", { slug, category: route.category });

  const openCategory = (category) => navigate("catalog", { category });

  let content = null;

  if (catalogState === "error" && route.page !== "product") {
    content = (
      <main>
        <div className="empty-state">
          <p className="empty-title">{t("errorLoading")}</p>
          <button className="primary-button" type="button" onClick={loadCatalog}>
            {t("retry")}
          </button>
        </div>
      </main>
    );
  } else if (route.page === "product") {
    content = (
      <ProductPage
        key={route.slug}
        slug={route.slug}
        t={t}
        lang={lang}
        onBack={() => navigate("catalog", { category: route.category })}
        onAddToCart={cart.add}
        favorite={favorites.isFavorite(route.slug)}
        onToggleFavorite={favorites.toggle}
      />
    );
  } else if (route.page === "catalog") {
    content = (
      <CatalogPage
        t={t}
        lang={lang}
        categories={categories}
        products={products}
        activeCategory={route.category}
        onCategoryChange={(category) =>
          setRoute((current) => ({ ...current, category }))
        }
        onOpenProduct={openProduct}
        isFavorite={favorites.isFavorite}
        onToggleFavorite={favorites.toggle}
      />
    );
  } else if (route.page === "cart") {
    content = (
      <CartPage
        t={t}
        lang={lang}
        items={cart.items}
        count={cart.count}
        onSetQty={cart.setQty}
        onSetMeters={cart.setMeters}
        onRemove={cart.remove}
        onClear={cart.clear}
        onGoShopping={() => navigate("catalog", { category: "" })}
        onOpenProduct={openProduct}
        onCheckout={() => navigate("checkout")}
        total={cart.total}
      />
    );
  } else if (route.page === "checkout") {
    content = (
      <CheckoutPage
        t={t}
        lang={lang}
        items={cart.items}
        total={cart.total}
        telegramUser={telegramUser}
        onBack={() => navigate("cart")}
        onClearCart={cart.clear}
        onContinue={() => navigate("catalog", { category: "" })}
      />
    );
  } else if (route.page === "favorites") {
    content = (
      <FavoritesPage
        t={t}
        lang={lang}
        items={favorites.items}
        onOpenProduct={openProduct}
        isFavorite={favorites.isFavorite}
        onToggleFavorite={favorites.toggle}
        onGoShopping={() => navigate("catalog", { category: "" })}
      />
    );
  } else if (route.page === "orders") {
    content = (
      <OrdersPage t={t} lang={lang} />
    );
  } else if (route.page === "profile") {
    content = (
      <ProfilePage
        t={t}
        lang={lang}
        setLang={setLang}
        telegramUser={telegramUser}
        authState={authState}
        server={server}
        cartCount={cart.count}
        cartTotal={cart.total}
        favoritesCount={favorites.items.length}
        onCart={() => navigate("cart")}
        onFavorites={() => navigate("favorites")}
        onOrders={() => navigate("orders")}
        onCurrency={() => navigate("currency")}
      />
    );
  } else if (route.page === "currency") {
    content = <CurrencyPage t={t} lang={lang} />;
  } else {
    content = (
      <HomePage
        t={t}
        lang={lang}
        categories={categories}
        products={products}
        hero={storeSettings}
        onOpenProduct={openProduct}
        onOpenCategory={openCategory}
        isFavorite={favorites.isFavorite}
        onToggleFavorite={favorites.toggle}
      />
    );
  }

  const navPage =
    route.page === "product"
      ? "catalog"
      : route.page === "currency"
        ? "profile"
      : ["cart", "checkout"].includes(route.page)
        ? ""
        : route.page;

  return (
    <div className="app">
      <TopBar
        t={t}
        lang={lang}
        setLang={setLang}
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === "dark" ? "light" : "dark"))
        }
        cartCount={cart.count}
        onCart={() => navigate("cart")}
        onHome={() => navigate("home")}
        storeSettings={storeSettings}
        onShowLocation={() => setShowStoreLocation(true)}
      />

      {content}

      {showStoreLocation && (
        <StoreLocationModal
          t={t}
          store={storeSettings}
          onClose={() => setShowStoreLocation(false)}
        />
      )}

      <BottomNav t={t} page={navPage} onNavigate={(page) => navigate(page)} />
    </div>
  );
}

function socialHandle(value) {
  return (value || "")
    .replace(/^@/, "")
    .replace(/^https?:\/\/(t\.me|instagram\.com)\//i, "")
    .replace(/\/$/, "");
}

function StoreLocationModal({ t, store, onClose }) {
  const lat = store?.store_latitude;
  const lng = store?.store_longitude;
  const hasCoords =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  const mapUrl = hasCoords
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : store?.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
      : "";

  const hasInfo =
    store &&
    (store.phone ||
      store.address ||
      store.working_hours ||
      store.delivery_info ||
      store.payment_info ||
      store.instagram ||
      store.telegram ||
      hasCoords);

  return (
    <div className="modal-overlay top-aligned" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="location-modal store-info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="location-modal-head">
          <div>
            <h3>{store?.store_name || t("storeLocationTitle") || "Местоположение магазина"}</h3>
            <p className="admin-note">{t("storeInfoSubtitle") || "Информация и местоположение"}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("close") || "Закрыть"}>
            <X size={18} />
          </button>
        </div>

        {hasInfo ? (
          <div className="store-info-list">
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
                  openExternalLink(`https://t.me/${socialHandle(store.telegram)}`);
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
                  openExternalLink(`https://instagram.com/${socialHandle(store.instagram)}`);
                }}
              >
                <Instagram size={16} />
                <span>{t("contactInstagram")}</span>
                <strong>{store.instagram}</strong>
              </a>
            )}

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
          </div>
        ) : (
          <p className="admin-note">{t("storeLocationEmpty") || "Местоположение пока не указано"}</p>
        )}

        {hasCoords && (
          <div className="store-modal-map-wrap">
            <StoreMap latitude={lat} longitude={lng} />
          </div>
        )}

        {mapUrl && (
          <a
            className="primary-button"
            href={mapUrl}
            onClick={(e) => {
              e.preventDefault();
              openExternalLink(mapUrl);
            }}
          >
            {t("openInMaps") || "Открыть на карте"}
          </a>
        )}
      </div>
    </div>
  );
}

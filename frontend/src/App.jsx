import { useCallback, useEffect, useState } from "react";

import BottomNav from "./components/BottomNav";
import TopBar from "./components/TopBar";
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
import {
  checkServer,
  fetchCategories,
  fetchProducts,
  fetchStoreSettings,
  telegramLogin
} from "./services/api";

const INITIAL_ROUTE = { page: "home", slug: null, category: "" };

export default function App() {
  const [route, setRoute] = useState(INITIAL_ROUTE);
  const [lang, setLang] = useState(detectLanguage);
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
            setTelegramUser(data.user);
            setAuthState("ok");
          })
          .catch(() => setAuthState("error"));
      }
    }

    checkServer()
      .then(() => setServer("online"))
      .catch(() => setServer("offline"));

    loadCatalog();

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

    if (route.page === "product") {
      backButton.show();
    } else {
      backButton.hide();
    }

    const handleBack = () => navigate("catalog", { category: route.category });

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
      />
    );
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
      : ["cart", "checkout"].includes(route.page)
        ? ""
        : route.page;

  return (
    <div className="app">
      <TopBar
        t={t}
        lang={lang}
        setLang={setLang}
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

function StoreLocationModal({ t, store, onClose }) {
  const lat = store?.store_latitude;
  const lng = store?.store_longitude;
  const hasCoords = typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);
  const mapUrl = hasCoords
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : store?.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
      : "";

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="location-modal" onClick={(e) => e.stopPropagation()}>
        <div className="location-modal-head">
          <div>
            <h3>{t("storeLocationTitle") || "Местоположение магазина"}</h3>
            {store?.store_name && <p className="admin-note">{store.store_name}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("close") || "Закрыть"}>×</button>
        </div>
        {store?.address && (
          <p className="location-modal-address">{store.address}</p>
        )}
        {mapUrl && (
          <a className="primary-button" href={mapUrl} target="_blank" rel="noreferrer">
            {t("openInMaps") || "Открыть на карте"}
          </a>
        )}
        {!store?.address && !mapUrl && (
          <p className="admin-note">{t("storeLocationEmpty") || "Местоположение пока не указано."}</p>
        )}
      </div>
    </div>
  );
}

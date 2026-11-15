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
      />

      {content}

      <BottomNav t={t} page={navPage} onNavigate={(page) => navigate(page)} />
    </div>
  );
}

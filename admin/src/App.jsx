
import { useEffect, useMemo, useRef, useState } from "react";

import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  MapPin,
  Package,
  Settings,
  TrendingUp,
  Tag,
  Wifi,
  WifiOff,
  Menu,
  Search,
  ImageOff,
  Phone,
  ExternalLink,
  Pencil,
  Copy,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Megaphone
} from "lucide-react";

import LoginScreen from "./components/LoginScreen";
import DeliveryMap from "./components/DeliveryMap";
import ProductForm from "./components/ProductForm";
import AnalyticsPanel from "./components/AnalyticsPanel";
import BroadcastPanel from "./components/BroadcastPanel";
import ClientsTable from "./components/ClientsTable";
import SettingsForm from "./components/SettingsForm";
import { LANGUAGES, detectLanguage, translations } from "./i18n";
import { adminDownload, adminFetch } from "./services/adminApi";
import { assetUrl, formatPrice, localized, priceLabel } from "./utils/format";

const STATUS_KEYS = {
  new: "statusNew",
  confirmed: "statusConfirmed",
  delivering: "statusDelivering",
  done: "statusDone",
  cancelled: "statusCancelled"
};

const STATUSES = Object.keys(STATUS_KEYS);

const MENU = [
  [LayoutDashboard, "menuHome", "home"],
  [ShoppingBag, "menuOrders", "orders"],
  [Package, "menuProducts", "products"],
  [Tag, "menuCategories", "categories"],
  [Users, "menuClients", "clients"],
  [MapPin, "menuMap", "map"],
  [Megaphone, "menuBroadcast", "broadcast"],
  [TrendingUp, "menuAnalytics", "analytics"],
  [Settings, "menuSettings", "settings"]
];

const SECTION_META = {
  home: ["dashboardTitle", "dashboardSubtitle"],
  orders: ["ordersTitle", "ordersSubtitle"],
  products: ["productsTitle", "productsSubtitle"],
  clients: ["clientsTitle", "clientsSubtitle"],
  map: ["mapTitle", "mapSubtitle"],
  broadcast: ["broadcastMenuTitle", "broadcastMenuSubtitle"],
  analytics: ["analyticsTitle", "analyticsSubtitle"],
  settings: ["settingsTitle", "settingsSubtitle"],
  categories: ["categoriesTitle", "categoriesSubtitle"]
};

const EMPTY_SETTINGS = {
  store_name: "Farrux shop (Hozoosp)",
  phone: "",
  address: "",
  working_hours: "",
  delivery_info: "",
  payment_info: "",
  instagram: "",
  telegram: "",
  hero_title_ru: "",
  hero_title_uz: "",
  hero_title_uzc: "",
  hero_text_ru: "",
  hero_text_uz: "",
  hero_text_uzc: "",
  banner_active: false,
  banner_text_ru: "",
  banner_text_uz: "",
  banner_text_uzc: "",
  banner_category: "",
  logo_url: "",
  store_latitude: null,
  store_longitude: null
};

function toSettingsForm(settings) {
  return settings ? { ...EMPTY_SETTINGS, ...settings } : null;
}

export default function App() {
  // --- АВТОРИЗАЦИЯ ---
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!localStorage.getItem("admin_password")
  );

  const handleLogout = () => {
    localStorage.removeItem("admin_password");
    setIsAuthenticated(false);
  };

  const [server, setServer] = useState("checking");
  const [lang, setLang] = useState(detectLanguage);
  const [section, setSection] = useState("home");

  // На телефонах меню изначально свернуто
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth <= 768);

  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [dataState, setDataState] = useState("loading");
  const [newOrderNotice, setNewOrderNotice] = useState(null);
  const knownOrderIdRef = useRef(0);
  const noticeInitRef = useRef(false);
  const [search, setSearch] = useState("");

  const [formProduct, setFormProduct] = useState(undefined);

  // Новый режим: обычное редактирование или создание копии
  const [isDuplicate, setIsDuplicate] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState("");

  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [settingsForm, setSettingsForm] = useState(null);
  const [settingsState, setSettingsState] = useState("idle");
  const [settingsError, setSettingsError] = useState("");
  const [categoryDraft, setCategoryDraft] = useState(null);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState(null);
  const [categoryError, setCategoryError] = useState("");

  const t = (key, vars = {}) => {
    const dictionary = translations[lang] || translations.ru;
    let text = dictionary[key] ?? translations.ru[key] ?? key;

    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }

    return text;
  };

  const loadData = () => {
    setDataState("loading");

    Promise.all([
      adminFetch("/api/admin/summary"),
      adminFetch("/api/admin/products"),
      adminFetch("/api/admin/orders"),
      adminFetch("/api/admin/categories"),
      adminFetch("/api/admin/clients"),
      adminFetch(`/api/admin/analytics?days=${analyticsDays}`),
      adminFetch("/api/admin/settings")
    ])
      .then(
        ([
          summaryData,
          productList,
          orderList,
          categoryList,
          clientList,
          analyticsData,
          settingsData
        ]) => {
          setSummary(summaryData);
          setProducts(productList);
          setOrders(orderList);

          const maxId = orderList.reduce(
            (max, order) => Math.max(max, order.id || 0),
            0
          );

          if (!noticeInitRef.current) {
            knownOrderIdRef.current = maxId;
            noticeInitRef.current = true;
          } else if (maxId > knownOrderIdRef.current) {
            const fresh = orderList.filter(
              (order) => order.id > knownOrderIdRef.current
            );
            knownOrderIdRef.current = maxId;
            setNewOrderNotice({
              count: fresh.length,
              number: fresh[0]?.number || ""
            });
          }

          setCategories(categoryList);
          setClients(clientList);
          setAnalytics(analyticsData);
          setSettingsForm((current) => current ?? toSettingsForm(settingsData));
          setDataState("ready");
        }
      )
      .catch((error) => {
        if (error?.status === 401 || error?.status === 403) {
          handleLogout();
        } else {
          setDataState("error");
        }
      });
  };

  useEffect(() => {
    try {
      localStorage.setItem("uy_admin_lang", lang);
    } catch {
      // localStorage может быть недоступен
    }

    document.documentElement.lang = lang === "uzc" ? "uz-Cyrl" : lang;
  }, [lang]);

  useEffect(() => {
    if (!isAuthenticated) return;

    fetch(`${API_BASE}/api/health`)
      .then((response) => {
        if (!response.ok) throw new Error("Server error");
        return response.json();
      })
      .then((data) => {
        setServer(data.database === "connected" ? "online" : "offline");
      })
      .catch(() => setServer("offline"));

    loadData();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const poll = async () => {
      try {
        const [summaryData, orderList] = await Promise.all([
          adminFetch("/api/admin/summary"),
          adminFetch("/api/admin/orders")
        ]);

        setSummary(summaryData);
        setOrders(orderList);

        const maxId = orderList.reduce(
          (max, order) => Math.max(max, order.id || 0),
          0
        );

        if (!noticeInitRef.current) {
          knownOrderIdRef.current = maxId;
          noticeInitRef.current = true;
          return;
        }

        if (maxId > knownOrderIdRef.current) {
          const fresh = orderList.filter(
            (order) => order.id > knownOrderIdRef.current
          );
          knownOrderIdRef.current = maxId;
          setNewOrderNotice({
            count: fresh.length,
            number: fresh[0]?.number || ""
          });
        }
      } catch {
        // Ошибки обновления не критичны
      }
    };

    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  const handleMenuClick = (value) => {
    setSection(value);
    if (window.innerWidth <= 768) {
      setSidebarCollapsed(true);
    }
  };

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return products;
    }

    return products.filter((product) =>
      ["ru", "uz", "uzc"].some((code) =>
        (product[`name_${code}`] || "").toLowerCase().includes(query)
      )
    );
  }, [products, search]);

  const statCards = [
    ["statOrdersToday", summary?.orders_today ?? 0, ShoppingBag],
    ["statNewOrders", summary?.orders_new ?? 0, TrendingUp],
    ["statBuyers", summary?.users ?? 0, Users],
    ["statProducts", summary?.products ?? 0, Package],
    ["statCategories", summary?.categories ?? 0, LayoutDashboard]
  ];

  const changeStatus = async (orderId, status) => {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId ? { ...order, status } : order
      )
    );

    try {
      await adminFetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });

      const summaryData = await adminFetch("/api/admin/summary");
      setSummary(summaryData);
    } catch {
      loadData();
    }
  };

  // Обычное редактирование товара
  const openEdit = async (product) => {
    try {
      const detail = await adminFetch(`/api/admin/products/${product.id}`);
      setIsDuplicate(false);
      setFormProduct(detail);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        handleLogout();
      }
    }
  };

  // Дублирование товара: загружаем полные данные оригинала
  const openDuplicate = async (product) => {
    try {
      const detail = await adminFetch(`/api/admin/products/${product.id}`);

      setIsDuplicate(true);
      setFormProduct(detail);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        handleLogout();
      } else {
        alert(error.message || "Не удалось загрузить товар для копирования");
      }
    }
  };

  // Открытие формы нового товара
  const openNewProduct = () => {
    setIsDuplicate(false);
    setFormProduct(null);
  };

  const closeProductForm = () => {
    setFormProduct(undefined);
    setIsDuplicate(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleteError("");

    try {
      await adminFetch(`/api/admin/products/${deleteTarget.id}`, {
        method: "DELETE"
      });

      setDeleteTarget(null);
      loadData();
    } catch (error) {
      setDeleteError(error.message || t("formError"));
    }
  };

  const loadAnalytics = async (days) => {
    setAnalyticsDays(days);

    try {
      setAnalytics(await adminFetch(`/api/admin/analytics?days=${days}`));
    } catch {
      // Оставляем предыдущие данные, если запрос не удался
    }
  };

  const updateSettingsField = (field, value) => {
    setSettingsForm((current) => ({ ...current, [field]: value }));
    setSettingsState("idle");
  };

  const saveSettings = async (event) => {
    event.preventDefault();

    if (settingsState === "saving" || !settingsForm) {
      return;
    }

    setSettingsState("saving");
    setSettingsError("");

    try {
      const saved = await adminFetch("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(settingsForm)
      });

      setSettingsForm(toSettingsForm(saved));
      setSettingsState("saved");
    } catch (error) {
      setSettingsState("error");
      setSettingsError(error.message || t("settingsError"));
    }
  };

  const visibleOrders = useMemo(() => {
    let list = orderFilter
      ? orders.filter((order) => order.status === orderFilter)
      : orders;

    const q = orderSearch.trim().toLowerCase();

    if (q) {
      const digits = q.replace(/\D/g, "");
      list = list.filter((order) => {
        return (
          (order.number || "").toLowerCase().includes(q) ||
          (order.customer_name || "").toLowerCase().includes(q) ||
          (order.phone || "").toLowerCase().includes(q) ||
          (order.address || "").toLowerCase().includes(q) ||
          (digits && (order.phone || "").replace(/\D/g, "").includes(digits))
        );
      });
    }

    return list;
  }, [orders, orderFilter, orderSearch]);

  const openCategoryCreate = () => {
    setCategoryDeleteTarget(null);
    setCategoryError("");
    setCategoryDraft({
      id: null,
      slug: "",
      name_ru: "",
      name_uz: "",
      name_uzc: "",
      sort_order: categories.length + 1
    });
  };

  const openCategoryEdit = (category) => {
    setCategoryDeleteTarget(null);
    setCategoryError("");
    setCategoryDraft({ ...category });
  };

  const saveCategory = async (event) => {
    event.preventDefault();

    if (!categoryDraft) {
      return;
    }

    const payload = {
      slug: categoryDraft.slug,
      name_ru: categoryDraft.name_ru,
      name_uz: categoryDraft.name_uz,
      name_uzc: categoryDraft.name_uzc,
      sort_order: Number(categoryDraft.sort_order) || 0
    };

    try {
      if (categoryDraft.id) {
        await adminFetch(`/api/admin/categories/${categoryDraft.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await adminFetch("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }

      setCategoryDraft(null);
      loadData();
    } catch (error) {
      setCategoryError(error.message || t("categorySaveError"));
    }
  };

  const confirmDeleteCategory = async () => {
    if (!categoryDeleteTarget) {
      return;
    }

    try {
      await adminFetch(`/api/admin/categories/${categoryDeleteTarget.id}`, {
        method: "DELETE"
      });

      setCategoryDeleteTarget(null);
      loadData();
    } catch (error) {
      setCategoryError(error.message || t("categorySaveError"));
    }
  };

  const moveCategory = async (category, direction) => {
    const index = categories.findIndex((item) => item.id === category.id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;

    if (swapIndex < 0 || swapIndex >= categories.length) {
      return;
    }

    const next = [...categories];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    const orderedIds = next.map((item) => item.id);

    try {
      await adminFetch("/api/admin/categories/order", {
        method: "POST",
        body: JSON.stringify({ ordered_ids: orderedIds })
      });
    } catch {
      // Если порядок не удалось сохранить — перечитаем данные
    }

    loadData();
  };

  const moveProduct = async (product, direction, list = products) => {
    const index = list.findIndex((item) => item.id === product.id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;

    if (swapIndex < 0 || swapIndex >= list.length) {
      return;
    }

    const next = [...list];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    const orderedIds = next.map((item) => item.id);

    try {
      await adminFetch("/api/admin/products/order", {
        method: "POST",
        body: JSON.stringify({ ordered_ids: orderedIds })
      });
    } catch {
      // Если порядок не удалось сохранить — перечитаем данные
    }

    loadData();
  };

  // --- ЭКРАН ВХОДА ---
  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="admin">
      {!sidebarCollapsed && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      <aside className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="admin-brand">
          <div className="admin-logo">U</div>
          <div className="brand-copy">
            <h2>FARRUX SHOP</h2>
            <p>{t("controlPanel")}</p>
          </div>
        </div>

        <nav>
          {MENU.map(([Icon, key, value]) => {
            const badgeCount =
              value === "orders" ? summary?.orders_new ?? 0 : 0;

            return (
              <button
                className={section === value ? "selected" : ""}
                key={key}
                type="button"
                title={sidebarCollapsed ? t(key) : undefined}
                onClick={() => handleMenuClick(value)}
              >
                <span className="nav-icon-wrap">
                  <Icon size={19} />
                  {badgeCount > 0 && (
                    <span className="nav-badge">{badgeCount}</span>
                  )}
                </span>
                <span className="nav-label">{t(key)}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            <span className="online-dot" />
            <span className="nav-label">Farrux shop (Hozoosp) v1.0</span>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={
              sidebarCollapsed
                ? t("expandSidebar") || "Развернуть меню"
                : t("collapseSidebar") || "Свернуть меню"
            }
            title={
              sidebarCollapsed
                ? t("expandSidebar") || "Развернуть меню"
                : t("collapseSidebar") || "Свернуть меню"
            }
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </aside>

      <main className="admin-content">
        <header className="admin-header">
          <button
            className="menu-button"
            aria-label={t("toggleSidebar") || "Меню"}
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
          >
            <Menu />
          </button>

          <div>
            <h1>{t((SECTION_META[section] || SECTION_META.home)[0])}</h1>
            <p>{t((SECTION_META[section] || SECTION_META.home)[1])}</p>
          </div>

          <div className="admin-header-actions">
            <div
              className="language-switch"
              role="group"
              aria-label={t("language")}
            >
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
              type="button"
              onClick={handleLogout}
              title="Выйти"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#666",
                display: "flex",
                alignItems: "center",
                marginRight: "10px"
              }}
            >
              <LogOut size={20} />
            </button>

            <div className="admin-avatar">U</div>
          </div>
        </header>

        {newOrderNotice && (
          <div className="new-order-notice" role="status">
            <div>
              <strong>{t("newOrderNoticeTitle")}</strong>
              <p>
                {newOrderNotice.count > 1
                  ? t("newOrdersNoticeText", { count: newOrderNotice.count })
                  : t("newOrderNoticeText", {
                      number: newOrderNotice.number || ""
                    })}
              </p>
            </div>

            <div className="new-order-notice-actions">
              <button
                type="button"
                className="small-button"
                onClick={() => {
                  setSection("orders");
                  setNewOrderNotice(null);
                }}
              >
                {t("openOrders")}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setNewOrderNotice(null)}
              >
                {t("dismiss")}
              </button>
            </div>
          </div>
        )}

        {dataState === "denied" ? (
          <div className="admin-placeholder access-denied">
            <h2>{t("accessDeniedTitle")}</h2>
            <p>{t("accessDeniedText")}</p>
            <p className="admin-note">{t("accessDeniedHint")}</p>
          </div>
        ) : (
          <>
            {section === "home" && (
              <>
                <div className="welcome-card">
                  <span>{t("ownerPanel")}</span>
                  <h2>{t("welcomeTitle")}</h2>
                  <p>{t("welcomeText")}</p>
                </div>

                <section className="stats">
                  {statCards.map(([key, value, Icon]) => (
                    <div className="stat-card" key={key}>
                      <Icon size={22} />
                      <p>{t(key)}</p>
                      <h2>{dataState === "ready" ? value : "—"}</h2>
                    </div>
                  ))}
                </section>

                <section className="connection-card">
                  <h3>{t("systemStatus")}</h3>

                  <div className="connection-status">
                    {server === "online" ? (
                      <>
                        <Wifi color="#16a34a" />
                        <span>{t("backendOnline")}</span>
                      </>
                    ) : server === "offline" ? (
                      <>
                        <WifiOff color="#dc2626" />
                        <span>{t("backendOffline")}</span>
                      </>
                    ) : (
                      <span>{t("backendChecking")}</span>
                    )}
                  </div>

                  <p>{t("statsNote")}</p>
                </section>

                {dataState === "ready" && (
                  <ProductsTable
                    t={t}
                    lang={lang}
                    products={products.slice(0, 5)}
                    title={t("productsTitle")}
                    subtitle={null}
                    compact
                  />
                )}
              </>
            )}

            {section === "products" && (
              <>
                <div className="table-toolbar">
                  <div className="admin-search">
                    <Search size={17} />
                    <input
                      type="search"
                      value={search}
                      placeholder={t("adminSearch")}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>

                  <span className="table-count">
                    {t("productsCount", { count: visibleProducts.length })}
                  </span>

                  <button
                    type="button"
                    className="primary-admin-button"
                    onClick={openNewProduct}
                  >
                    <Plus size={16} />
                    {t("addProduct")}
                  </button>
                </div>

                {dataState === "loading" && (
                  <p className="admin-note">{t("loading")}</p>
                )}

                {dataState === "error" && (
                  <div className="admin-error">
                    <p>{t("errorLoading")}</p>
                    <button type="button" onClick={loadData}>
                      {t("retry")}
                    </button>
                  </div>
                )}

                {dataState === "ready" && (
                  <ProductsTable
                    t={t}
                    lang={lang}
                    products={visibleProducts}
                    title={t("productsTitle")}
                    subtitle={t("productsSubtitle")}
                    onEdit={openEdit}
                    onDuplicate={openDuplicate}
                    onDelete={(product) => {
                      setDeleteError("");
                      setDeleteTarget(product);
                    }}
                    onMove={moveProduct}
                  />
                )}
              </>
            )}

            {section === "categories" && (
              <>
                {dataState === "loading" && (
                  <p className="admin-note">{t("loading")}</p>
                )}

                {dataState === "error" && (
                  <div className="admin-error">
                    <p>{t("errorLoading")}</p>
                    <button type="button" onClick={loadData}>
                      {t("retry")}
                    </button>
                  </div>
                )}

                {dataState === "ready" && !categoryDraft && (
                  <CategoriesCard
                    t={t}
                    lang={lang}
                    categories={categories}
                    onAdd={() => openCategoryCreate()}
                    onEdit={openCategoryEdit}
                    onDelete={(category) => {
                      setCategoryError("");
                      setCategoryDeleteTarget(category);
                    }}
                    onMove={moveCategory}
                  />
                )}

                {dataState === "ready" && categoryDraft && (
                  <section className="products-card">
                    <div className="products-card-head">
                      <div>
                        <h3>
                          {categoryDraft.id ? t("categoryEdit") : t("categoryAdd")}
                        </h3>
                      </div>
                    </div>

                    <form className="settings-card" onSubmit={saveCategory}>
                      <div className="admin-field">
                        <span>{t("categorySlug")}</span>
                        <input
                          type="text"
                          value={categoryDraft.slug ?? ""}
                          onChange={(event) =>
                            setCategoryDraft({
                              ...categoryDraft,
                              slug: event.target.value
                            })
                          }
                        />
                      </div>

                      <div className="admin-field">
                        <span>{t("categoryNameRu")}</span>
                        <input
                          type="text"
                          value={categoryDraft.name_ru ?? ""}
                          onChange={(event) =>
                            setCategoryDraft({
                              ...categoryDraft,
                              name_ru: event.target.value
                            })
                          }
                        />
                      </div>

                      <div className="admin-field">
                        <span>{t("categoryNameUz")}</span>
                        <input
                          type="text"
                          value={categoryDraft.name_uz ?? ""}
                          onChange={(event) =>
                            setCategoryDraft({
                              ...categoryDraft,
                              name_uz: event.target.value
                            })
                          }
                        />
                      </div>

                      <div className="admin-field">
                        <span>{t("categoryNameUzc")}</span>
                        <input
                          type="text"
                          value={categoryDraft.name_uzc ?? ""}
                          onChange={(event) =>
                            setCategoryDraft({
                              ...categoryDraft,
                              name_uzc: event.target.value
                            })
                          }
                        />
                      </div>

                      <div className="admin-field">
                        <span>{t("categorySort")}</span>
                        <input
                          type="number"
                          value={categoryDraft.sort_order ?? 0}
                          onChange={(event) =>
                            setCategoryDraft({
                              ...categoryDraft,
                              sort_order: Number(event.target.value) || 0
                            })
                          }
                        />
                      </div>

                      {categoryError && (
                        <p className="form-error">{categoryError}</p>
                      )}

                      <footer className="settings-foot">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setCategoryDraft(null)}
                        >
                          {t("cancel")}
                        </button>
                        <button type="submit" className="primary-admin-button">
                          {t("categorySave")}
                        </button>
                      </footer>
                    </form>
                  </section>
                )}
              </>
            )}

            {section === "orders" && (
              <>
                <div className="table-toolbar" style={{ marginBottom: 12 }}>
                  <div className="admin-search">
                    <Search size={17} />
                    <input
                      type="search"
                      value={orderSearch}
                      placeholder={t("clientSearch")}
                      onChange={(event) => setOrderSearch(event.target.value)}
                    />
                  </div>
                </div>

                <div className="order-filters">
                  <button
                    type="button"
                    className={orderFilter === "" ? "active" : ""}
                    onClick={() => setOrderFilter("")}
                  >
                    {t("filterAll")} ({orders.length})
                  </button>

                  {STATUSES.map((status) => {
                    const count = orders.filter(
                      (order) => order.status === status
                    ).length;

                    return (
                      <button
                        key={status}
                        type="button"
                        className={orderFilter === status ? "active" : ""}
                        onClick={() => setOrderFilter(status)}
                      >
                        {t(STATUS_KEYS[status])} ({count})
                      </button>
                    );
                  })}

                  <a
                    className="ghost-button"
                    href={`${API_BASE}/api/admin/orders/export`}
                    onClick={(event) => {
                      event.preventDefault();
                      adminDownload("/api/admin/orders/export", "orders.csv").catch(
                        () => {}
                      );
                    }}
                    style={{ marginLeft: "auto" }}
                  >
                    CSV
                  </a>
                </div>

                {dataState === "loading" && (
                  <p className="admin-note">{t("loading")}</p>
                )}

                {dataState === "error" && (
                  <div className="admin-error">
                    <p>{t("errorLoading")}</p>
                    <button type="button" onClick={loadData}>
                      {t("retry")}
                    </button>
                  </div>
                )}

                {dataState === "ready" && visibleOrders.length === 0 && (
                  <div className="admin-placeholder">
                    <h2>{t("noOrders")}</h2>
                    <p>{t("ordersSubtitle")}</p>
                  </div>
                )}

                {dataState === "ready" && visibleOrders.length > 0 && (
                  <div className="orders-list">
                    {visibleOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        t={t}
                        lang={lang}
                        onStatusChange={changeStatus}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {section === "clients" && (
              <>
                {dataState === "loading" && (
                  <p className="admin-note">{t("loading")}</p>
                )}

                {dataState === "error" && (
                  <div className="admin-error">
                    <p>{t("errorLoading")}</p>
                    <button type="button" onClick={loadData}>
                      {t("retry")}
                    </button>
                  </div>
                )}

                {dataState === "ready" && (
                  <ClientsTable
                    clients={clients}
                    t={t}
                    lang={lang}
                    search={clientSearch}
                    onSearchChange={setClientSearch}
                    apiBase={API_BASE}
                  />
                )}
              </>
            )}

            {section === "broadcast" && (
              <>
                {dataState === "loading" && (
                  <p className="admin-note">{t("loading")}</p>
                )}
                {dataState === "error" && (
                  <div className="admin-error">
                    <p>{t("errorLoading")}</p>
                    <button type="button" onClick={loadData}>
                      {t("retry")}
                    </button>
                  </div>
                )}
                {dataState === "ready" && (
                  <BroadcastPanel
                    t={t}
                    lang={lang}
                    products={products}
                    webappUrl={import.meta.env.VITE_WEBAPP_URL || storeSettings?.webapp_url || ""}
                  />
                )}
              </>
            )}

            {section === "analytics" && (
              <>
                {dataState === "loading" && (
                  <p className="admin-note">{t("loading")}</p>
                )}

                {dataState === "error" && (
                  <div className="admin-error">
                    <p>{t("errorLoading")}</p>
                    <button type="button" onClick={loadData}>
                      {t("retry")}
                    </button>
                  </div>
                )}

                {dataState === "ready" && (
                  <AnalyticsPanel
                    analytics={analytics}
                    days={analyticsDays}
                    onDaysChange={loadAnalytics}
                    onRefresh={() => loadAnalytics(analyticsDays)}
                    t={t}
                    lang={lang}
                  />
                )}
              </>
            )}

            {section === "settings" && (
              <>
                {dataState === "loading" && (
                  <p className="admin-note">{t("loading")}</p>
                )}

                {dataState === "error" && (
                  <div className="admin-error">
                    <p>{t("errorLoading")}</p>
                    <button type="button" onClick={loadData}>
                      {t("retry")}
                    </button>
                  </div>
                )}

                {dataState === "ready" && (
                  <SettingsForm
                    form={settingsForm}
                    t={t}
                    state={settingsState}
                    error={settingsError}
                    onChange={updateSettingsField}
                    onSubmit={saveSettings}
                    categories={categories}
                  />
                )}
              </>
            )}

            {section === "map" && dataState === "ready" && (
              <DeliveryMap orders={orders} t={t} lang={lang} />
            )}

            {![
              "home",
              "products",
              "orders",
              "clients",
              "map",
              "analytics",
              "settings",
              "categories"
            ].includes(section) && (
              <div className="admin-placeholder">
                <h2>{t("menuSoonTitle")}</h2>
                <p>{t("menuSoon")}</p>
              </div>
            )}
          </>
        )}

        {formProduct !== undefined && (
          <ProductForm
            key={`${formProduct?.id ?? "new"}-${isDuplicate ? "duplicate" : "normal"}`}
            product={formProduct}
            categories={categories}
            t={t}
            lang={lang}
            isDuplicate={isDuplicate}
            onClose={closeProductForm}
            onSaved={() => {
              closeProductForm();
              loadData();
            }}
          />
        )}

        {deleteTarget && (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="confirm-modal">
              <h2>{t("deleteProduct")}</h2>
              <p>
                {t("deleteConfirm", {
                  name: localized(deleteTarget, "name", lang)
                })}
              </p>

              {deleteError && <p className="form-error">{deleteError}</p>}

              <div className="confirm-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setDeleteTarget(null);
                    setDeleteError("");
                  }}
                >
                  {t("cancel")}
                </button>

                <button
                  type="button"
                  className="danger-button"
                  onClick={confirmDelete}
                >
                  {t("deleteProduct")}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function OrderCard({ order, t, lang, onStatusChange }) {
  const locale =
    lang === "uzc" ? "uz-Cyrl-UZ" : lang === "uz" ? "uz-UZ" : "ru-RU";

  const createdAt = new Date(order.created_at).toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <article className="order-card">
      <header className="order-card-head">
        <div>
          <h3>{order.number}</h3>
          <p>
            {t("orderCreated")}: {createdAt}
          </p>
        </div>

        <select
          className={`status-select status-${order.status}`}
          value={order.status}
          onChange={(event) =>
            onStatusChange(order.id, event.target.value)
          }
        >
          {Object.entries(STATUS_KEYS).map(([status, key]) => (
            <option key={status} value={status}>
              {t(key)}
            </option>
          ))}
        </select>
      </header>

      <div className="order-grid">
        <div>
          <span>{t("orderCustomer")}</span>
          <strong>{order.customer_name}</strong>
        </div>

        <div>
          <span>{t("orderPhone")}</span>
          <a href={`tel:${order.phone}`}>
            <Phone size={13} />
            {order.phone}
          </a>
        </div>

        <div className="order-address">
          <span>{t("orderAddress")}</span>
          <strong>{order.address || "—"}</strong>

          {order.latitude !== null && order.longitude !== null && (
            <a
              className="map-link"
              href={`https://maps.google.com/?q=${order.latitude},${order.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              <MapPin size={13} />
              {t("openMap")}
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>

      <div className="order-items">
        {order.items.map((item) => {
          const isMeter = item.pricing_type === "meter" && item.meters;
          const isArea =
            item.pricing_type === "area" &&
            item.width_cm &&
            item.height_cm;

          const area = isArea
            ? (item.width_cm * item.height_cm) / 10000
            : 0;

          return (
            <div className="order-item-line" key={item.id}>
              <div className="order-item-main">
                {item.image_url ? (
                  <a
                    href={assetUrl(item.image_url)}
                    target="_blank"
                    rel="noreferrer"
                    title={t("openPhoto") || "Открыть фото"}
                  >
                    <img
                      className="order-item-thumb"
                      src={assetUrl(item.image_url)}
                      alt=""
                      loading="lazy"
                    />
                  </a>
                ) : (
                  <div className="order-item-thumb placeholder" />
                )}

                <span>
                  {isMeter
                    ? `${Number(item.meters)} ${t("unitMeter")}`
                    : isArea
                      ? `${item.quantity} × ${item.width_cm}×${item.height_cm} ${t("unitCm")}`
                      : `${item.quantity} ×`}{" "}
                  {localized(item, "name", lang)}
                  {!isArea && item.variant_label
                    ? ` · ${item.variant_label}`
                    : ""}
                  {isArea ? ` · ${area.toFixed(2)} ${t("unitM2")}` : ""}
                  {item.color_ru ? ` · ${localized(item, "color", lang)}` : ""}
                </span>
              </div>

              <strong>{formatPrice(item.line_total, lang)}</strong>
            </div>
          );
        })}
      </div>

      {order.comment && (
        <p className="order-comment">
          💬 {order.comment}
        </p>
      )}

      <footer className="order-card-foot">
        <span>{t("orderTotalLabel")}</span>
        <strong>{formatPrice(order.total, lang)}</strong>
      </footer>
    </article>
  );
}

function CategoriesCard({
  t,
  lang,
  categories,
  onAdd,
  onEdit,
  onDelete,
  onMove
}) {
  const nameOf = (category) =>
    category[`name_${lang}`] || category.name_ru || "";

  return (
    <section className="products-card">
      <div className="products-card-head">
        <div>
          <h3>{t("categoriesTitle")}</h3>
          <p>{t("categoriesSubtitle")}</p>
        </div>

        <span className="table-count">
          {t("categoryProducts", { count: categories.length })}
        </span>

        <button
          type="button"
          className="primary-admin-button"
          onClick={onAdd}
        >
          <Plus size={16} />
          {t("categoryAdd")}
        </button>
      </div>

      {categories.length === 0 ? (
        <p className="admin-note">{t("catalogEmpty")}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("categorySort")}</th>
                <th>{t("colCategory")}</th>
                <th>{t("categoryProducts", { count: categories.length })}</th>
                <th>{t("tableActions")}</th>
              </tr>
            </thead>

            <tbody>
              {categories.map((category, index) => (
                <tr key={category.id}>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="icon-button"
                        disabled={index === 0}
                        title={t("categoryMoveUp")}
                        aria-label={t("categoryMoveUp")}
                        onClick={() => onMove(category, "up")}
                      >
                        <ChevronUp size={15} />
                      </button>

                      <button
                        type="button"
                        className="icon-button"
                        disabled={index === categories.length - 1}
                        title={t("categoryMoveDown")}
                        aria-label={t("categoryMoveDown")}
                        onClick={() => onMove(category, "down")}
                      >
                        <ChevronDown size={15} />
                      </button>
                    </div>
                  </td>

                  <td>
                    <div className="table-product">
                      <div>
                        <strong>{nameOf(category)}</strong>
                        <span>{category.slug}</span>
                      </div>
                    </div>
                  </td>

                  <td>{category.product_count}</td>

                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title={t("categoryEdit")}
                        aria-label={t("categoryEdit")}
                        onClick={() => onEdit(category)}
                      >
                        <Pencil size={15} />
                      </button>

                      <button
                        type="button"
                        className="icon-button danger"
                        title={t("categoryDelete")}
                        aria-label={t("categoryDelete")}
                        onClick={() => onDelete(category)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProductsTable({
  t,
  lang,
  products,
  title,
  subtitle,
  compact,
  onEdit,
  onDuplicate,
  onDelete,
  onMove
}) {
  return (
    <section className={`products-card${compact ? " compact" : ""}`}>
      <div className="products-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>

        <span className="table-count">
          {t("productsCount", { count: products.length })}
        </span>
      </div>

      {products.length === 0 ? (
        <p className="admin-note">{t("catalogEmpty")}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("colProduct")}</th>
                <th>{t("colCategory")}</th>
                <th>{t("colPrice")}</th>
                <th>{t("colPurchasePrice")}</th>
                <th>{t("colStatus")}</th>
                {!compact && <th>{t("tableActions")}</th>}
              </tr>
            </thead>

            <tbody>
              {products.map((product, index) => (
                <tr key={product.id}>
                  <td>
                    <div className="table-product">
                      <div className="table-thumb">
                        {product.image_url ? (
                          <img
                            src={assetUrl(product.image_url)}
                            alt={localized(product, "name", lang)}
                          />
                        ) : (
                          <ImageOff size={18} />
                        )}
                      </div>

                      <div>
                        <strong>{localized(product, "name", lang)}</strong>

                        {product.is_featured && (
                          <span className="featured-badge">
                            {t("featuredBadge")}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td>{localized(product, "category_name", lang)}</td>

                  <td className="price-cell">
                    {priceLabel(product, t, lang)}
                  </td>

                  <td className="price-cell">
                    {formatPrice(product.purchase_price, lang)}
                  </td>

                  <td>
                    <span
                      className={`status-pill${
                        !product.in_stock
                          ? " out-of-stock"
                          : product.is_active
                            ? " active"
                            : ""
                      }`}
                    >
                      {!product.in_stock
                        ? t("statusOutOfStock")
                        : product.is_active
                          ? t("statusActive")
                          : t("statusHidden")}
                    </span>
                  </td>

                  {!compact && (
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="icon-button"
                          disabled={index === 0}
                          title={t("categoryMoveUp")}
                          aria-label={t("categoryMoveUp")}
                          onClick={() => onMove?.(product, "up", products)}
                        >
                          <ChevronUp size={15} />
                        </button>

                        <button
                          type="button"
                          className="icon-button"
                          disabled={index === products.length - 1}
                          title={t("categoryMoveDown")}
                          aria-label={t("categoryMoveDown")}
                          onClick={() => onMove?.(product, "down", products)}
                        >
                          <ChevronDown size={15} />
                        </button>

                        <button
                          type="button"
                          className="icon-button"
                          title={t("editProduct")}
                          aria-label={t("editProduct")}
                          onClick={() => onEdit(product)}
                        >
                          <Pencil size={15} />
                        </button>

                        {/* Новая кнопка дублирования товара */}
                        <button
                          type="button"
                          className="icon-button"
                          title="Дублировать товар"
                          aria-label="Дублировать товар"
                          onClick={() => onDuplicate?.(product)}
                        >
                          <Copy size={15} />
                        </button>

                        <button
                          type="button"
                          className="icon-button danger"
                          title={t("deleteProduct")}
                          aria-label={t("deleteProduct")}
                          onClick={() => onDelete(product)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

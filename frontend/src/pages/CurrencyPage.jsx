import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  Building2,
  Clock3,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";

import { fetchCurrencyRates } from "../services/api";
import "./CurrencyPage.css";

const CURRENCIES = ["USD", "EUR", "RUB", "KZT", "CNY", "GBP", "TRY", "CHF"];
const CURRENCY_META = {
  USD: { flag: "????", label: "USD" },
  EUR: { flag: "????", label: "EUR" },
  RUB: { flag: "????", label: "RUB" },
  KZT: { flag: "????", label: "KZT" },
  CNY: { flag: "????", label: "CNY" },
  GBP: { flag: "????", label: "GBP" },
  TRY: { flag: "????", label: "TRY" },
  CHF: { flag: "????", label: "CHF" },
};

function fmtRate(value) {
  if (value === null || value === undefined || value === "" || Number(value) <= 0) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function fmtTime(iso, lang) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = lang === "ru" ? "ru-RU" : lang === "uzc" ? "uz-UZ" : "uz-UZ";
  return d.toLocaleString(locale, {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CurrencyPage({ t, lang }) {
  const [currency, setCurrency] = useState("USD");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");

  const load = useCallback(async (cur = currency, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const res = await fetchCurrencyRates(cur, "bank", "name");
      setData(res);
    } catch (e) {
      setError(e?.message || "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currency]);

  useEffect(() => { load(currency); }, [currency]); // eslint-disable-line

  const banks = useMemo(() => {
    const list = Array.isArray(data?.banks) ? [...data.banks] : [];
    const q = query.trim().toLowerCase();
    let filtered = q ? list.filter((b) => (b.name || "").toLowerCase().includes(q)) : list;
    if (sort === "buy_desc") {
      filtered.sort((a, b) => (b.buy == null ? -1 : a.buy == null ? 1 : b.buy - a.buy) || (a.name || "").localeCompare(b.name || ""));
    } else if (sort === "sell_asc") {
      filtered.sort((a, b) => (a.sell == null ? 1 : b.sell == null ? -1 : a.sell - b.sell) || (a.name || "").localeCompare(b.name || ""));
    } else {
      filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    return filtered;
  }, [data, query, sort]);

  const bestBuy = data?.best_buy;
  const bestSell = data?.best_sell;
  const updatedAt = fmtTime(data?.updated_at, lang);
  const stale = Boolean(data?.is_stale);
  const noData = t("currencyNoData");

  return (
    <main className="currency-page">
      <section className="lux-card currency-hero">
        <div className="lux-section-head">
          <span className="lux-icon"><BadgeDollarSign size={18} /></span>
          <div>
            <h1 className="currency-title">{t("currencyTitle")}</h1>
            <p className="currency-subtitle">{t("currencySubtitle")}</p>
          </div>
        </div>

        <div className="currency-tabs" role="tablist" aria-label="Currencies">
          {CURRENCIES.map((c) => {
            const active = c === currency;
            const meta = CURRENCY_META[c] || { flag: "??", label: c };
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active}
                className={`currency-tab ${active ? "active" : ""}`}
                onClick={() => setCurrency(c)}
              >
                <span className="flag">{meta.flag}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>

        <div className="currency-hero-meta">
          <span className={`currency-updated ${stale ? "stale" : ""}`}>
            <Clock3 size={14} />
            {updatedAt ? t("currencyUpdatedAt", { time: updatedAt }) : t("currencyNoUpdated")}
          </span>
          <button type="button" className="currency-refresh" onClick={() => load(currency, true)} disabled={refreshing || loading}>
            <RefreshCw size={14} className={refreshing ? "spin" : ""} />
            {t("currencyRefresh")}
          </button>
        </div>

        {stale && (
          <div className="currency-stale-banner" role="status">
            <TriangleAlert size={15} />
            <span>{t("currencyStaleWarning")}</span>
          </div>
        )}
      </section>

      <section className="currency-best-grid">
        <article className="lux-card currency-best-card buy">
          <div className="currency-best-head">
            <span className="currency-best-icon"><TrendingUp size={16} /></span>
            <span>{t("currencyBestBuy")}</span>
          </div>
          <div className="currency-best-rate">{fmtRate(bestBuy?.rate) ?? noData} <small>UZS</small></div>
          <div className="currency-best-bank">{bestBuy?.bank || noData}</div>
        </article>

        <article className="lux-card currency-best-card sell">
          <div className="currency-best-head">
            <span className="currency-best-icon"><TrendingDown size={16} /></span>
            <span>{t("currencyBestSell")}</span>
          </div>
          <div className="currency-best-rate">{fmtRate(bestSell?.rate) ?? noData} <small>UZS</small></div>
          <div className="currency-best-bank">{bestSell?.bank || noData}</div>
        </article>
      </section>

      <section className="lux-card currency-list-card">
        <div className="currency-list-head">
          <div className="currency-search">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("currencySearchBank")} aria-label={t("currencySearchBank")} />
          </div>
          <label className="currency-sort">
            <span>{t("currencySort")}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">{t("currencySortName")}</option>
              <option value="buy_desc">{t("currencySortBuy")}</option>
              <option value="sell_asc">{t("currencySortSell")}</option>
            </select>
          </label>
        </div>

        <div className="currency-table-wrap">
          <table className="currency-table">
            <thead>
              <tr>
                <th>{t("currencyBank")}</th>
                <th>{t("currencyBuy")}</th>
                <th>{t("currencySell")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="currency-empty">{t("loading")}</td></tr>
              ) : error ? (
                <tr><td colSpan={3} className="currency-empty error">{t("currencyLoadError")}</td></tr>
              ) : banks.length === 0 ? (
                <tr><td colSpan={3} className="currency-empty">{noData}</td></tr>
              ) : (
                banks.map((b) => {
                  const isBestBuy = bestBuy?.slug && b.slug === bestBuy.slug;
                  const isBestSell = bestSell?.slug && b.slug === bestSell.slug;
                  return (
                    <tr key={b.slug || b.name}>
                      <td>
                        <div className="currency-bank-cell">
                          <span className="currency-bank-logo"><Building2 size={15} /></span>
                          <span className="currency-bank-name">{b.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`currency-rate ${isBestBuy ? "best-buy" : ""}`}>
                          {fmtRate(b.buy) ?? noData}
                          {isBestBuy && <em>{t("currencyBestTag")}</em>}
                        </span>
                      </td>
                      <td>
                        <span className={`currency-rate ${isBestSell ? "best-sell" : ""}`}>
                          {fmtRate(b.sell) ?? noData}
                          {isBestSell && <em>{t("currencyBestTag")}</em>}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lux-card currency-source">
        <div className="currency-source-row">
          <span>{t("currencySource")}</span>
          <strong>{data?.source_name || "bank.uz / Wasyt"}</strong>
        </div>
        <div className="currency-source-row">
          <span>{t("currencyAttribution")}</span>
          <span>{data?.attribution || "bank.uz orqali Wasyt API"}</span>
        </div>
      </section>
    </main>
  );
}

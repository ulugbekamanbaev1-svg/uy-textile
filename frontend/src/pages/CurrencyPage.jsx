import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  BadgeDollarSign,
  Building2,
  Clock3,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";

import { convertCurrency, fetchCurrencyRates } from "../services/api";
import "./CurrencyPage.css";

const CURRENCIES = ["USD", "EUR", "RUB"];
const CURRENCY_META = {
  USD: { flag: "🇺🇸", label: "USD" },
  EUR: { flag: "🇪🇺", label: "EUR" },
  RUB: { flag: "🇷🇺", label: "RUB" },
};

function fmtRate(value) {
  if (value === null || value === undefined || value === "" || Number(value) <= 0) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function fmtAmount(value, maxFractionDigits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("ru-RU", { maximumFractionDigits });
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

  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("UZS");
  const [bank, setBank] = useState("best");
  const [conv, setConv] = useState(null);
  const [convLoading, setConvLoading] = useState(false);
  const [convError, setConvError] = useState("");

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
    const q = query.trim().toLower();
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

  const bankOptions = useMemo(() => {
    const list = Array.isArray(data?.banks) ? data.banks : [];
    return [{ slug: "best", name: t("currencyBestRate") }, ...list.map((b) => ({ slug: b.slug, name: b.name }))];
  }, [data, t]);

  useEffect(() => {
    // keep converter bank valid
    if (!bankOptions.some((b) => b.slug === bank)) setBank("best");
  }, [bankOptions, bank]);

  useEffect(() => {
    // default converter currencies follow selected tab
    setFrom((prev) => (["USD", "EUR", "RUB", "UZS"].includes(prev) ? prev : currency));
    setTo((prev) => (["USD", "EUR", "RUB", "UZS"].includes(prev) ? prev : "UZS"));
  }, [currency]);

  const runConvert = useCallback(async () => {
    const amt = Number(String(amount).replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) { setConv(null); return; }
    if (from === to) {
      setConv({ amount: amt, from, to, operation: "same", rate: 1, result: amt, bank: null, updated_at: data?.updated_at, is_stale: stale, warning: "" });
      return;
    }
    setConvLoading(true);
    setConvError("");
    try {
      // For UZS->foreign user "buys" foreign: sell; foreign->UZS user "sells" foreign: buy.
      // Cross uses backend cross logic.
      const operation = from === "UZS" ? "sell" : "buy";
      const res = await convertCurrency({ amount: amt, from, to, operation, bank, sourceType: "bank" });
      setConv(res);
    } catch (e) {
      setConvError(e?.message || "error");
      setConv(null);
    } finally {
      setConvLoading(false);
    }
  }, [amount, from, to, bank, data, stale]);

  useEffect(() => {
    const timer = setTimeout(() => { runConvert(); }, 250);
    return () => clearTimeout(timer);
  }, [runConvert]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const operationLabel = (op) => {
    if (op === "buy") return t("currencyBuyOperation");
    if (op === "sell") return t("currencySellOperation");
    if (op === "cross") return t("currencyCrossOperation");
    return "";
  };

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
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={currency === c}
              className={`currency-tab ${currency === c ? "active" : ""}`}
              onClick={() => setCurrency(c)}
            >
              <span className="currency-tab-flag">{CURRENCY_META[c].flag}</span>
              <span>{c}</span>
            </button>
          ))}
        </div>

        <div className="currency-meta-row">
          <div className="currency-updated">
            <Clock3 size={14} />
            <span>{updatedAt ? t("currencyUpdatedAt", { time: updatedAt }) : t("currencyTemporarilyUnavailable")}</span>
          </div>
          <button type="button" className="currency-refresh" onClick={() => load(currency, true)} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            <span>{t("currencyRefresh")}</span>
          </button>
        </div>

        {stale && (
          <div className="currency-warning">
            <TriangleAlert size={15} />
            <span>{t("currencyStaleWarning")}</span>
          </div>
        )}
      </section>

      <section className="currency-best-grid">
        <div className="lux-card currency-best-card">
          <div className="currency-best-label"><TrendingUp size={14} /> {t("currencyBestBuy")}</div>
          <div className="currency-best-bank">{bestBuy?.bank || "—"}</div>
          <div className="currency-best-rate">{fmtRate(bestBuy?.rate) ? `${fmtRate(bestBuy?.rate)} UZS` : noData}</div>
        </div>
        <div className="lux-card currency-best-card">
          <div className="currency-best-label"><TrendingDown size={14} /> {t("currencyBestSell")}</div>
          <div className="currency-best-bank">{bestSell?.bank || "—"}</div>
          <div className="currency-best-rate">{fmtRate(bestSell?.rate) ? `${fmtRate(bestSell?.rate)} UZS` : noData}</div>
        </div>
      </section>

      <section className="lux-card currency-list-card">
        <div className="currency-controls">
          <label className="currency-search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("currencySearch")} />
          </label>
          <label className="currency-sort">
            <ArrowUpDown size={15} />
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">{t("currencySortName")}</option>
              <option value="buy_desc">{t("currencySortBuy")}</option>
              <option value="sell_asc">{t("currencySortSell")}</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="currency-state">{t("currencyLoading")}</div>
        ) : error ? (
          <div className="currency-state error">{t("currencyError")}</div>
        ) : banks.length === 0 ? (
          <div className="currency-state">{t("currencyNoBanks")}</div>
        ) : (
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
                {banks.map((b) => (
                  <tr key={b.slug || b.name}>
                    <td>
                      <div className="currency-bank-cell">
                        <span className="currency-bank-icon"><Building2 size={15} /></span>
                        <span className="currency-bank-name">{b.name}</span>
                      </div>
                    </td>
                    <td className="currency-rate-cell">{fmtRate(b.buy) ? `${fmtRate(b.buy)}` : <span className="muted">{noData}</span>}</td>
                    <td className="currency-rate-cell">{fmtRate(b.sell) ? `${fmtRate(b.sell)}` : <span className="muted">{noData}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="lux-card currency-converter">
        <div className="lux-section-head">
          <span className="lux-icon"><ArrowUpDown size={18} /></span>
          <div>
            <h2>{t("currencyConverter")}</h2>
          </div>
        </div>

        <div className="converter-grid">
          <label className="converter-field">
            <span>{t("currencyAmount")}</span>
            <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>

          <label className="converter-field">
            <span>{t("currencyFrom")}</span>
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              {["USD", "EUR", "RUB", "UZS"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <div className="converter-swap-wrap">
            <button type="button" className="converter-swap" onClick={swap} aria-label={t("currencySwap")}>
              <ArrowUpDown size={16} />
            </button>
          </div>

          <label className="converter-field">
            <span>{t("currencyTo")}</span>
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {["USD", "EUR", "RUB", "UZS"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <label className="converter-field">
          <span>{t("currencyBank")}</span>
          <select value={bank} onChange={(e) => setBank(e.target.value)}>
            {bankOptions.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
          </select>
        </label>

        <div className="converter-result">
          {convLoading ? (
            <div className="currency-state">{t("currencyLoading")}</div>
          ) : convError ? (
            <div className="currency-state error">{t("currencyError")}</div>
          ) : conv ? (
            <>
              <div className="converter-result-main">
                <span className="label">{t("currencyResult")}</span>
                <strong>{conv.result == null ? noData : `${fmtAmount(conv.result, 4)} ${conv.to || to}`}</strong>
              </div>
              <div className="converter-result-meta">
                <div><span>{t("currencyBank")}:</span> <b>{conv.bank || t("currencyBestRate")}</b></div>
                <div><span>{t("currencyUsedRate")}:</span> <b>{conv.rate == null ? noData : fmtAmount(conv.rate, 6)}</b></div>
                <div><span>{t("currencyOperation")}:</span> <b>{operationLabel(conv.operation)}</b></div>
                <div><span>{t("currencyUpdatedAt", { time: "{time}" }).replace("{time}", "").replace(": ", "")}:</span> <b>{fmtTime(conv.updated_at || data?.updated_at, lang) || "—"}</b></div>
              </div>
            </>
          ) : null}
          <div className="converter-warning">{t("currencyEstimateWarning")}</div>
        </div>
      </section>

      <section className="lux-card currency-source">
        <div className="currency-source-row"><span>{t("currencySource")}:</span> <b>{data?.source_name || "Wasyt / bank.uz"}</b></div>
        {data?.source_url && (
          <div className="currency-source-row"><span>URL:</span> <a href={data.source_url} target="_blank" rel="noreferrer">{data.source_url}</a></div>
        )}
        {data?.attribution && <div className="currency-source-row"><span>Attribution:</span> <b>{data.attribution}</b></div>}
        <p className="currency-source-note">{t("currencySourceNote")}</p>
      </section>
    </main>
  );
}
import { useEffect, useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  QrCode,
  RefreshCw,
  ScanLine,
  ShoppingBag,
  Smartphone,
  Users
} from "lucide-react";

import { API_BASE, adminDownload, adminFetch, getStoredPassword } from "../services/adminApi";

function authHeaders() {
  const headers = new Headers();
  const initData = window.Telegram?.WebApp?.initData || "";
  if (initData) headers.set("X-Telegram-Init-Data", initData);
  const password = getStoredPassword() || import.meta.env.VITE_ADMIN_PASSWORD || "admin123";
  const bytes = new TextEncoder().encode(`admin:${password}`);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  headers.set("Authorization", `Basic ${btoa(binary)}`);
  return headers;
}

async function fetchBlob(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!response.ok) throw new Error("Не удалось загрузить файл");
  return response.blob();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}

function formatMoney(value, t) {
  return `${formatNumber(value)} ${t("currency") || "so'm"}`;
}

function LabelPreview({ layout, qrSrc, t }) {
  const isHangtag = layout === "hangtag";
  return (
    <div className={`qr-label-preview ${isHangtag ? "hangtag" : "sticker"}`}>
      <div className="qr-label-inner">
        {isHangtag && <div className="qr-label-hole" aria-hidden="true" />}
        <div className="qr-label-brand">FARRUX SHOP</div>
        <div className="qr-label-sub">{t("qrLabelHomeTextile")}</div>
        <div className="qr-label-line" />
        <div className="qr-label-slogan">{t("qrLabelSlogan")}</div>
        <div className="qr-label-qrwrap">
          {qrSrc ? (
            <img src={qrSrc} alt="QR" className="qr-label-qrimg" />
          ) : (
            <div className="qr-label-qrplaceholder">QR</div>
          )}
        </div>
        <div className="qr-label-scan">{t("qrLabelScan")}</div>
        <div className="qr-label-thanks">{t("qrLabelThanks")}</div>
      </div>
    </div>
  );
}

export default function QrPanel({ t, lang = "ru" }) {
  const [info, setInfo] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qrSrc, setQrSrc] = useState("");
  const [dateFrom, setDateFrom] = useState(daysAgoIso(30));
  const [dateTo, setDateTo] = useState(todayIso());
  const [downloading, setDownloading] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("days", "30");
    return params.toString();
  }, [dateFrom, dateTo]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [infoData, analyticsData, pngBlob] = await Promise.all([
        adminFetch("/api/admin/qr/info"),
        adminFetch(`/api/admin/qr/analytics?${query}`),
        fetchBlob("/api/admin/qr/download/png?box_size=14")
      ]);
      setInfo(infoData);
      setAnalytics(analyticsData);
      setQrSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(pngBlob);
      });
    } catch (e) {
      setError(e.message || t("errorLoading"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => {
      setQrSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return "";
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAnalytics = async () => {
    try {
      setError("");
      const data = await adminFetch(`/api/admin/qr/analytics?${query}`);
      setAnalytics(data);
    } catch (e) {
      setError(e.message || t("errorLoading"));
    }
  };

  const download = async (path, filename, key) => {
    try {
      setDownloading(key);
      await adminDownload(path, filename);
    } catch (e) {
      setError(e.message || t("qrDownloadError"));
    } finally {
      setDownloading("");
    }
  };

  const statCards = analytics
    ? [
        [t("qrScans"), formatNumber(analytics.scans), ScanLine],
        [t("qrUniqueVisitors"), formatNumber(analytics.unique_visitors), Users],
        [t("qrMiniAppOpens"), formatNumber(analytics.miniapp_opens), Smartphone],
        [t("qrOrders"), formatNumber(analytics.orders), ShoppingBag],
        [t("qrCompletedOrders"), formatNumber(analytics.completed_orders), QrCode],
        [t("qrConversion"), `${analytics.conversion}%`, RefreshCw]
      ]
    : [];

  return (
    <div className="qr-panel">
      <div className="analytics-toolbar qr-toolbar">
        <div className="qr-date-filter">
          <label className="qr-date-field">
            <span>{t("qrDateFrom")}</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="qr-date-field">
            <span>{t("qrDateTo")}</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <button type="button" className="small-button" onClick={refreshAnalytics}>
            {t("qrApplyFilter")}
          </button>
          <button type="button" className="small-button" onClick={load}>
            <RefreshCw size={14} /> {t("qrRefresh")}
          </button>
        </div>
      </div>

      {error && <div className="admin-error"><p>{error}</p></div>}
      {loading && <p className="admin-note">{t("loading")}</p>}

      {!loading && info && (
        <>
          {info.warnings?.length > 0 && (
            <div className="qr-warnings">
              {info.warnings.map((w, i) => (
                <p key={i} className="qr-warning">{w}</p>
              ))}
            </div>
          )}

          <div className="qr-top-grid">
            <section className="products-card analytics-card qr-main-card">
              <div className="products-card-head">
                <h3>{t("qrPermanentTitle")}</h3>
              </div>
              <div className="qr-main-layout">
                <div className="qr-preview-box">
                  {qrSrc ? <img src={qrSrc} alt="Farrux Shop QR" className="qr-preview-img" /> : <div className="qr-label-qrplaceholder">QR</div>}
                </div>
                <div className="qr-main-meta">
                  <p className="admin-note">{t("qrPermanentHint")}</p>
                  <div className="qr-meta-row"><span>{t("qrUrlLabel")}</span><code>{info.qr_url}</code></div>
                  <div className="qr-meta-row"><span>{t("qrTelegramLabel")}</span><code>{info.telegram_url || "—"}</code></div>
                  <div className="qr-meta-row"><span>{t("qrStartParamLabel")}</span><code>{info.start_param}</code></div>
                  <div className="qr-downloads">
                    <button type="button" className="small-button" disabled={downloading === "png"} onClick={() => download("/api/admin/qr/download/png?box_size=20", "farrux-shop-qr.png", "png")}>
                      <Download size={14} /> PNG
                    </button>
                    <button type="button" className="small-button" disabled={downloading === "svg"} onClick={() => download("/api/admin/qr/download/svg", "farrux-shop-qr.svg", "svg")}>
                      <Download size={14} /> SVG
                    </button>
                    <button type="button" className="small-button" disabled={downloading === "hangtag"} onClick={() => download(`/api/admin/qr/download/pdf?layout=hangtag&sheet=true&lang=${lang}`, `farrux-hangtag-sheet-${lang}.pdf`, "hangtag")}>
                      <Download size={14} /> {t("qrHangtagPdf")}
                    </button>
                    <button type="button" className="small-button" disabled={downloading === "sticker"} onClick={() => download(`/api/admin/qr/download/pdf?layout=sticker&sheet=true&lang=${lang}`, `farrux-sticker-sheet-${lang}.pdf`, "sticker")}>
                      <Download size={14} /> {t("qrStickerPdf")}
                    </button>
                  </div>
                  {info.telegram_url && (
                    <a className="small-button qr-link-button" href={info.telegram_url} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} /> {t("qrOpenTelegram")}
                    </a>
                  )}
                </div>
              </div>
            </section>
          </div>

          <section className="stats analytics-stats qr-stats">
            {statCards.map(([label, value, Icon]) => (
              <div className="stat-card" key={label}>
                <Icon size={20} />
                <p>{label}</p>
                <h2>{value}</h2>
              </div>
            ))}
          </section>

          {analytics && (
            <section className="products-card analytics-card">
              <div className="products-card-head">
                <h3>{t("qrRevenue")}</h3>
                <span className="table-count">{formatMoney(analytics.revenue, t)}</span>
              </div>
              <p className="admin-note">
                {t("qrNotesUnique")} {t("qrNotesOpen")}
              </p>
              <div className="qr-daily-list">
                {analytics.daily.map((day) => (
                  <div className="qr-daily-row" key={day.day}>
                    <span className="qr-daily-date">{day.day}</span>
                    <span>{t("qrScansShort")}: {day.scans}</span>
                    <span>{t("qrMiniAppShort")}: {day.miniapp_opens}</span>
                    <span>{t("qrOrdersShort")}: {day.orders}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="qr-labels-grid">
            <section className="products-card analytics-card">
              <div className="products-card-head">
                <h3>{t("qrHangtagPreview")}</h3>
                <button type="button" className="small-button" onClick={() => download(`/api/admin/qr/download/pdf?layout=hangtag&lang=${lang}`, `farrux-hangtag-${lang}.pdf`, "hangtag-single")}>
                  <Download size={14} /> PDF
                </button>
              </div>
              <LabelPreview layout="hangtag" qrSrc={qrSrc} t={t} />
            </section>

            <section className="products-card analytics-card">
              <div className="products-card-head">
                <h3>{t("qrStickerPreview")}</h3>
                <button type="button" className="small-button" onClick={() => download(`/api/admin/qr/download/pdf?layout=sticker&lang=${lang}`, `farrux-sticker-${lang}.pdf`, "sticker-single")}>
                  <Download size={14} /> PDF
                </button>
              </div>
              <LabelPreview layout="sticker" qrSrc={qrSrc} t={t} />
            </section>
          </div>

          <section className="products-card analytics-card">
            <div className="products-card-head">
              <h3>{t("qrPrintGuideTitle")}</h3>
            </div>
            <ul className="qr-print-list">
              <li>{t("qrPrint1")}</li>
              <li>{t("qrPrint2")}</li>
              <li>{t("qrPrint3")}</li>
              <li>{t("qrPrint4")}</li>
              <li>{t("qrPrint5")}</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

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

function formatMoney(value) {
  return `${formatNumber(value)} so'm`;
}

function LabelPreview({ layout, qrSrc, t }) {
  const isHangtag = layout === "hangtag";
  return (
    <div className={`qr-label-preview ${isHangtag ? "hangtag" : "sticker"}`}>
      <div className="qr-label-inner">
        {isHangtag && <div className="qr-label-hole" aria-hidden="true" />}
        <div className="qr-label-brand">FARRUX SHOP</div>
        <div className="qr-label-sub">HOME TEXTILE</div>
        <div className="qr-label-line" />
        <div className="qr-label-slogan">YOUR HOME — YOUR COMFORT</div>
        <div className="qr-label-qrwrap">
          {qrSrc ? (
            <img src={qrSrc} alt="QR" className="qr-label-qrimg" />
          ) : (
            <div className="qr-label-qrplaceholder">QR</div>
          )}
        </div>
        <div className="qr-label-scan">SCAN TO VISIT OUR SHOP</div>
        <div className="qr-label-thanks">Спасибо, что выбираете Farrux Shop!</div>
      </div>
    </div>
  );
}

export default function QrPanel({ t }) {
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
      setError(e.message || "Не удалось скачать файл");
    } finally {
      setDownloading("");
    }
  };

  const statCards = analytics
    ? [
        [t("qrScans") || "Сканирования", formatNumber(analytics.scans), ScanLine],
        [t("qrUniqueVisitors") || "Уникальные посетители", formatNumber(analytics.unique_visitors), Users],
        [t("qrMiniAppOpens") || "Запуски Mini App", formatNumber(analytics.miniapp_opens), Smartphone],
        [t("qrOrders") || "Заказы через QR", formatNumber(analytics.orders), ShoppingBag],
        [t("qrCompletedOrders") || "Завершённые QR-заказы", formatNumber(analytics.completed_orders), QrCode],
        [t("qrConversion") || "Конверсия в заказ", `${analytics.conversion}%`, RefreshCw]
      ]
    : [];

  return (
    <div className="qr-panel">
      <div className="analytics-toolbar qr-toolbar">
        <div className="qr-date-filter">
          <label className="qr-date-field">
            <span>{t("qrDateFrom") || "С"}</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="qr-date-field">
            <span>{t("qrDateTo") || "По"}</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <button type="button" className="small-button" onClick={refreshAnalytics}>
            {t("qrApplyFilter") || "Применить"}
          </button>
          <button type="button" className="small-button" onClick={load}>
            <RefreshCw size={14} /> {t("refresh") || "Обновить"}
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
                <h3>{t("qrPermanentTitle") || "Постоянный QR Farrux Shop"}</h3>
              </div>
              <div className="qr-main-layout">
                <div className="qr-preview-box">
                  {qrSrc ? <img src={qrSrc} alt="Farrux Shop QR" className="qr-preview-img" /> : <div className="qr-label-qrplaceholder">QR</div>}
                </div>
                <div className="qr-main-meta">
                  <p className="admin-note">{t("qrPermanentHint") || "Один постоянный QR для всех товаров. Меняйте Telegram-ссылку на сервере — QR перепечатывать не нужно."}</p>
                  <div className="qr-meta-row"><span>QR URL</span><code>{info.qr_url}</code></div>
                  <div className="qr-meta-row"><span>Telegram</span><code>{info.telegram_url || "—"}</code></div>
                  <div className="qr-meta-row"><span>startapp</span><code>{info.start_param}</code></div>
                  <div className="qr-downloads">
                    <button type="button" className="small-button" disabled={downloading === "png"} onClick={() => download("/api/admin/qr/download/png?box_size=20", "farrux-shop-qr.png", "png")}>
                      <Download size={14} /> PNG
                    </button>
                    <button type="button" className="small-button" disabled={downloading === "svg"} onClick={() => download("/api/admin/qr/download/svg", "farrux-shop-qr.svg", "svg")}>
                      <Download size={14} /> SVG
                    </button>
                    <button type="button" className="small-button" disabled={downloading === "hangtag"} onClick={() => download("/api/admin/qr/download/pdf?layout=hangtag&sheet=true", "farrux-hangtag-sheet.pdf", "hangtag")}>
                      <Download size={14} /> {t("qrHangtagPdf") || "PDF бирки (A4)"}
                    </button>
                    <button type="button" className="small-button" disabled={downloading === "sticker"} onClick={() => download("/api/admin/qr/download/pdf?layout=sticker&sheet=true", "farrux-sticker-sheet.pdf", "sticker")}>
                      <Download size={14} /> {t("qrStickerPdf") || "PDF наклейки (A4)"}
                    </button>
                  </div>
                  {info.telegram_url && (
                    <a className="small-button qr-link-button" href={info.telegram_url} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} /> {t("qrOpenTelegram") || "Открыть Telegram-ссылку"}
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
                <h3>{t("qrRevenue") || "Выручка по QR-заказам"}</h3>
                <span className="table-count">{formatMoney(analytics.revenue)}</span>
              </div>
              <p className="admin-note">
                {(t("qrNotesUnique") || analytics.notes?.unique_visitors) + " "}
                {(t("qrNotesOpen") || analytics.notes?.miniapp_open)}
              </p>
              <div className="qr-daily-list">
                {analytics.daily.map((day) => (
                  <div className="qr-daily-row" key={day.day}>
                    <span className="qr-daily-date">{day.day}</span>
                    <span>{t("qrScansShort") || "Сканы"}: {day.scans}</span>
                    <span>Mini App: {day.miniapp_opens}</span>
                    <span>{t("qrOrdersShort") || "Заказы"}: {day.orders}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="qr-labels-grid">
            <section className="products-card analytics-card">
              <div className="products-card-head">
                <h3>{t("qrHangtagPreview") || "Подвесная бирка 50×80 мм"}</h3>
                <button type="button" className="small-button" onClick={() => download("/api/admin/qr/download/pdf?layout=hangtag", "farrux-hangtag.pdf", "hangtag-single")}>
                  <Download size={14} /> PDF
                </button>
              </div>
              <LabelPreview layout="hangtag" qrSrc={qrSrc} t={t} />
            </section>

            <section className="products-card analytics-card">
              <div className="products-card-head">
                <h3>{t("qrStickerPreview") || "Наклейка 50×50 мм"}</h3>
                <button type="button" className="small-button" onClick={() => download("/api/admin/qr/download/pdf?layout=sticker", "farrux-sticker.pdf", "sticker-single")}>
                  <Download size={14} /> PDF
                </button>
              </div>
              <LabelPreview layout="sticker" qrSrc={qrSrc} t={t} />
            </section>
          </div>

          <section className="products-card analytics-card">
            <div className="products-card-head">
              <h3>{t("qrPrintGuideTitle") || "Инструкция по печати"}</h3>
            </div>
            <ul className="qr-print-list">
              <li>{t("qrPrint1") || "Печатайте PDF в масштабе 100% (Actual size), без «Fit to page»."}</li>
              <li>{t("qrPrint2") || "Бирка: 50×80 мм, плотный картон 250–300 г/м², матовая ламинация."}</li>
              <li>{t("qrPrint3") || "Наклейка: 50×50 мм, матовая самоклеящаяся бумага или винил."}</li>
              <li>{t("qrPrint4") || "Не размещайте QR на сложном фоне и не уменьшайте белую зону вокруг него."}</li>
              <li>{t("qrPrint5") || "Перед тиражом сделайте тест: отсканируйте QR камерой iPhone и Android."}</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

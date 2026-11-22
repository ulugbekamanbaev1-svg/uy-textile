import { useEffect, useRef, useState } from "react";
import { ImagePlus, RefreshCw, Send, Trash2, Video } from "lucide-react";

import { adminFetch, assetUrl } from "../services/adminApi";

function emptyForm() {
  return {
    title: "",
    message: "",
    media_type: "none",
    media_url: "",
    buy_text: "Купить",
    buy_url: "",
    details_text: "Подробнее",
    details_url: ""
  };
}

function statusLabel(status, t) {
  return (
    {
      pending: t("broadcastPending"),
      sending: t("broadcastSending"),
      completed: t("broadcastCompleted"),
      failed: t("broadcastFailed")
    }[status] || status
  );
}

export default function BroadcastPanel({ t, lang, products, webappUrl }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/broadcasts");
      setItems(data);
    } catch (e) {
      setError(e.message || t("formError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const hasSending = items.some((item) => item.status === "sending" || item.status === "pending");
    if (!hasSending) return undefined;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [items]);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const pickProduct = (productId) => {
    const product = products.find((p) => String(p.id) === String(productId));
    if (!product) return;
    const base = (webappUrl || "").replace(/\/+$/, "");
    const detailsUrl = base ? `${base}/?startapp=product_${product.slug}` : "";
    const buyUrl = base ? `${base}/?startapp=buy_${product.slug}` : "";
    setForm((current) => ({
      ...current,
      title: current.title || product.name_ru || product.name_uz || "",
      buy_url: buyUrl || current.buy_url,
      details_url: detailsUrl || current.details_url,
      media_url: current.media_url || product.image_url || "",
      media_type:
        current.media_type === "none" && product.image_url ? "photo" : current.media_type
    }));
  };

  const uploadMedia = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await adminFetch("/api/admin/broadcasts/media", {
        method: "POST",
        body
      });
      const isVideo = /\.(mp4|mov|webm)$/i.test(file.name) || file.type.startsWith("video/");
      setForm((current) => ({
        ...current,
        media_url: result.url,
        media_type: isVideo ? "video" : "photo"
      }));
    } catch (e) {
      setError(e.message || t("formError"));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!form.message.trim()) {
      setError(t("broadcastMessageRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await adminFetch("/api/admin/broadcasts", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setForm(emptyForm());
      await load();
    } catch (e) {
      setError(e.message || t("formError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="broadcast-panel">
      <section className="products-card analytics-card">
        <div className="products-card-head">
          <div>
            <h3>{t("broadcastNew")}</h3>
            <p className="admin-note">{t("broadcastHint")}</p>
          </div>
        </div>

        <form className="broadcast-form" onSubmit={submit}>
          <div className="form-grid two">
            <label className="admin-field">
              <span>{t("broadcastTitle")}</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder={t("broadcastTitlePlaceholder")}
              />
            </label>

            <label className="admin-field">
              <span>{t("broadcastProduct")}</span>
              <select defaultValue="" onChange={(e) => pickProduct(e.target.value)}>
                <option value="">{t("broadcastSelectProduct")}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name_ru || product.name_uz}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="admin-field">
            <span>{t("broadcastMessage")}</span>
            <textarea
              rows={5}
              value={form.message}
              onChange={(e) => update("message", e.target.value)}
              placeholder={t("broadcastMessagePlaceholder")}
              required
            />
          </label>

          <div className="form-grid two">
            <label className="admin-field">
              <span>{t("broadcastMediaType")}</span>
              <select
                value={form.media_type}
                onChange={(e) => update("media_type", e.target.value)}
              >
                <option value="none">{t("broadcastMediaNone")}</option>
                <option value="photo">{t("broadcastMediaPhoto")}</option>
                <option value="video">{t("broadcastMediaVideo")}</option>
              </select>
            </label>

            <label className="admin-field">
              <span>{t("broadcastMediaUrl")}</span>
              <div className="image-actions">
                <input
                  type="text"
                  value={form.media_url}
                  onChange={(e) => update("media_url", e.target.value)}
                  placeholder="https://... или /static/..."
                />
                <button
                  type="button"
                  className="small-button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {form.media_type === "video" ? <Video size={14} /> : <ImagePlus size={14} />}
                  {uploading ? t("uploading") : t("upload")}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept="image/*,video/mp4,video/webm,video/quicktime"
                  onChange={uploadMedia}
                />
              </div>
            </label>
          </div>

          <div className="form-grid two">
            <label className="admin-field">
              <span>{t("broadcastBuyText")}</span>
              <input type="text" value={form.buy_text} onChange={(e) => update("buy_text", e.target.value)} />
            </label>
            <label className="admin-field">
              <span>{t("broadcastBuyUrl")}</span>
              <input type="text" value={form.buy_url} onChange={(e) => update("buy_url", e.target.value)} placeholder="https://..." />
            </label>
          </div>

          <div className="form-grid two">
            <label className="admin-field">
              <span>{t("broadcastDetailsText")}</span>
              <input type="text" value={form.details_text} onChange={(e) => update("details_text", e.target.value)} />
            </label>
            <label className="admin-field">
              <span>{t("broadcastDetailsUrl")}</span>
              <input type="text" value={form.details_url} onChange={(e) => update("details_url", e.target.value)} placeholder="https://..." />
            </label>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="broadcast-actions">
            <button type="submit" className="primary-admin-button" disabled={saving || uploading}>
              <Send size={15} />
              {saving ? t("saving") : t("broadcastSend")}
            </button>
            <button type="button" className="small-button" onClick={load}>
              <RefreshCw size={14} /> {t("refresh")}
            </button>
          </div>
        </form>
      </section>

      <section className="products-card analytics-card analytics-wide-card">
        <div className="products-card-head">
          <h3>{t("broadcastHistory")}</h3>
          <span className="table-count">{items.length}</span>
        </div>

        {loading ? (
          <p className="admin-note">{t("loading")}</p>
        ) : items.length === 0 ? (
          <p className="admin-note">{t("broadcastEmpty")}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t("broadcastMessage")}</th>
                  <th>{t("status")}</th>
                  <th>{t("broadcastSent")}</th>
                  <th>{t("broadcastFailed")}</th>
                  <th>{t("broadcastDate")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>#{item.id}</td>
                    <td>
                      <div className="broadcast-msg-cell">
                        <strong>{item.title || "—"}</strong>
                        <span>{(item.message || "").slice(0, 80)}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${item.status}`}>{statusLabel(item.status, t)}</span>
                    </td>
                    <td>{item.sent_count} / {item.total_recipients}</td>
                    <td className={item.failed_count ? "profit-value negative" : ""}>{item.failed_count}</td>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

import { useState } from "react";
import { ImagePlus, Save } from "lucide-react";

import StoreLocationPicker from "./StoreLocationPicker";
import { adminFetch, assetUrl } from "../services/adminApi";

export default function SettingsForm({
  form,
  t,
  state,
  error,
  onChange,
  onSubmit,
  categories = []
}) {
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState("");

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setLogoError("");

    try {
      const body = new FormData();
      body.append("file", file);
      const result = await adminFetch("/api/admin/uploads", {
        method: "POST",
        body
      });
      onChange("logo_url", result.url);
    } catch (uploadError) {
      setLogoError(uploadError.message || t("settingsError"));
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  };
  if (!form) {
    return <p className="admin-note">{t("loading")}</p>;
  }

  const field = (name, label, options = {}) => (
    <label className="admin-field">
      <span>{label}</span>
      <input
        type={options.type || "text"}
        value={form[name]}
        placeholder={options.placeholder || ""}
        onChange={(event) => onChange(name, event.target.value)}
      />
    </label>
  );

  const textarea = (name, label, placeholder = "") => (
    <label className="admin-field">
      <span>{label}</span>
      <textarea
        rows={3}
        value={form[name]}
        placeholder={placeholder}
        onChange={(event) => onChange(name, event.target.value)}
      />
    </label>
  );

  return (
    <form className="settings-card" onSubmit={onSubmit}>
      <p className="admin-note">{t("settingsPublicNote")}</p>

      <section className="form-section">
        <h3>{t("settingsMain")}</h3>

        <div className="admin-field">
          <span>{t("settingsLogo") || "Логотип магазина"}</span>
          <div className="image-upload" style={{ marginTop: 8 }}>
            <div className="image-preview" style={{ width: 96, height: 96, borderRadius: 16 }}>
              {form.logo_url ? (
                <img src={assetUrl(form.logo_url)} alt={form.store_name || "Logo"} />
              ) : (
                <ImagePlus size={24} />
              )}
            </div>
            <div className="image-actions">
              <label className="upload-button">
                <ImagePlus size={16} />
                {uploadingLogo ? t("uploading") : (t("uploadLogo") || "Загрузить логотип")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  disabled={uploadingLogo}
                  onChange={uploadLogo}
                />
              </label>
              <input
                type="text"
                value={form.logo_url || ""}
                placeholder={t("imageUrlLabel")}
                onChange={(event) => onChange("logo_url", event.target.value)}
              />
              {form.logo_url && (
                <button type="button" className="ghost-button" onClick={() => onChange("logo_url", "")}>
                  {t("remove") || "Удалить"}
                </button>
              )}
              {logoError && <p className="form-error">{logoError}</p>}
            </div>
          </div>
        </div>

        <div className="form-grid two">
          {field("store_name", t("settingsStoreName"))}
          {field("phone", t("settingsPhone"), {
            type: "tel",
            placeholder: "+998 90 000 00 00"
          })}
        </div>

        <div className="form-grid two">
          {field("address", t("settingsAddress"))}
          {field("working_hours", t("settingsHours"), {
            placeholder: "09:00 – 20:00"
          })}
        </div>
      </section>

      <section className="form-section">
        <h3>{t("settingsLocation") || "Местоположение магазина"}</h3>
        <p className="admin-note">{t("settingsLocationHint") || "Отметьте магазин на карте — покупатели увидят местоположение, нажав на логотип."}</p>

        <StoreLocationPicker
          latitude={form.store_latitude}
          longitude={form.store_longitude}
          t={t}
          onChange={(lat, lng) => {
            onChange("store_latitude", lat);
            onChange("store_longitude", lng);
          }}
        />
      </section>

      <section className="form-section">
        <h3>{t("settingsDetails")}</h3>

        <div className="form-grid two">
          {textarea(
            "delivery_info",
            t("settingsDeliveryInfo"),
            t("contactDelivery")
          )}
          {textarea(
            "payment_info",
            t("settingsPaymentInfo"),
            t("contactPayment")
          )}
          {textarea(
            "delivery_districts",
            t("settingsDeliveryDistricts"),
            t("settingsDeliveryDistrictsHint")
          )}
        </div>
      </section>

      <section className="form-section">
        <h3>{t("settingsContacts")}</h3>

        <div className="form-grid two">
          {field("instagram", t("settingsInstagram"), {
            placeholder: "@uytextile"
          })}
          {field("telegram", t("settingsTelegram"), {
            placeholder: "@uytextile_bot"
          })}
        </div>
      </section>

      <section className="form-section">
        <h3>{t("settingsHero")}</h3>

        <div className="admin-field">
          <span>{t("heroTitleRu")}</span>
          <input
            type="text"
            value={form["hero_title_ru"] ?? ""}
            onChange={(event) => onChange("hero_title_ru", event.target.value)}
          />
        </div>

        <div className="admin-field">
          <span>{t("heroTextRu")}</span>
          <textarea
            rows={2}
            value={form["hero_text_ru"] ?? ""}
            placeholder={t("heroTextHint")}
            onChange={(event) => onChange("hero_text_ru", event.target.value)}
          />
        </div>

        <div className="admin-field">
          <span>{t("heroTitleUz")}</span>
          <input
            type="text"
            value={form["hero_title_uz"] ?? ""}
            onChange={(event) => onChange("hero_title_uz", event.target.value)}
          />
        </div>

        <div className="admin-field">
          <span>{t("heroTextUz")}</span>
          <textarea
            rows={2}
            value={form["hero_text_uz"] ?? ""}
            placeholder={t("heroTextHint")}
            onChange={(event) => onChange("hero_text_uz", event.target.value)}
          />
        </div>

        <div className="admin-field">
          <span>{t("heroTitleUzc")}</span>
          <input
            type="text"
            value={form["hero_title_uzc"] ?? ""}
            onChange={(event) => onChange("hero_title_uzc", event.target.value)}
          />
        </div>

        <div className="admin-field">
          <span>{t("heroTextUzc")}</span>
          <textarea
            rows={2}
            value={form["hero_text_uzc"] ?? ""}
            placeholder={t("heroTextHint")}
            onChange={(event) => onChange("hero_text_uzc", event.target.value)}
          />
        </div>
      </section>

      <section className="form-section">
        <h3>{t("settingsBanner")}</h3>

        <label className="flag" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={Boolean(form["banner_active"])}
            onChange={(event) => onChange("banner_active", event.target.checked)}
          />
          {t("bannerActive")}
        </label>

        <div className="admin-field">
          <span>{t("bannerTextRu")}</span>
          <input
            type="text"
            value={form["banner_text_ru"] ?? ""}
            onChange={(event) => onChange("banner_text_ru", event.target.value)}
            placeholder={t("bannerTextHint")}
          />
        </div>

        <div className="admin-field">
          <span>{t("bannerTextUz")}</span>
          <input
            type="text"
            value={form["banner_text_uz"] ?? ""}
            onChange={(event) => onChange("banner_text_uz", event.target.value)}
            placeholder={t("bannerTextHint")}
          />
        </div>

        <div className="admin-field">
          <span>{t("bannerTextUzc")}</span>
          <input
            type="text"
            value={form["banner_text_uzc"] ?? ""}
            onChange={(event) => onChange("banner_text_uzc", event.target.value)}
            placeholder={t("bannerTextHint")}
          />
        </div>

        <label className="admin-field">
          <span>{t("bannerCategory")}</span>
          <select
            value={form["banner_category"] ?? ""}
            onChange={(event) => onChange("banner_category", event.target.value)}
          >
            <option value="">{t("bannerCategoryAll")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name_ru}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="form-section">
        <h3>{t("cartRemindersTitle")}</h3>
        <p className="admin-note">{t("cartRemindersHint")}</p>

        <label className="flag" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={Boolean(form["cart_reminders_enabled"])}
            onChange={(event) => onChange("cart_reminders_enabled", event.target.checked)}
          />
          {t("cartRemindersEnabled")}
        </label>

        <label className="flag" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={Boolean(form["cart_reminder_day_enabled"])}
            onChange={(event) => onChange("cart_reminder_day_enabled", event.target.checked)}
          />
          {t("cartReminderDay")}
        </label>

        <label className="flag" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={Boolean(form["cart_reminder_evening_enabled"])}
            onChange={(event) => onChange("cart_reminder_evening_enabled", event.target.checked)}
          />
          {t("cartReminderEvening")}
        </label>
      </section>

      <footer className="settings-foot">
        {state === "saved" && (
          <span className="save-ok">{t("settingsSaved")}</span>
        )}
        {state === "error" && (
          <span className="form-error">{error || t("settingsError")}</span>
        )}

        <button
          type="submit"
          className="primary-admin-button"
          disabled={state === "saving"}
        >
          <Save size={16} />
          {state === "saving" ? t("settingsSaving") : t("settingsSave")}
        </button>
      </footer>
    </form>
  );
}

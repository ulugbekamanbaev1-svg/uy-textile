import { useState } from "react";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";

import { adminFetch, assetUrl } from "../services/adminApi";
import { localized } from "../utils/format";

function emptyVariant() {
  return {
    id: null,
    label: "",
    width_cm: "",
    height_cm: "",
    price: ""
  };
}

function emptyColor() {
  return {
    id: null,
    name_ru: "",
    name_uz: "",
    name_uzc: "",
    hex: "#f6f2e9"
  };
}

function toText(value) {
  return value === null || value === undefined ? "" : String(value);
}

function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const number = Number(String(value).replace(",", "."));

  return Number.isFinite(number) ? Math.round(number) : null;
}

function initialForm(product, categories) {
  if (product) {
    return {
      slug: product.slug,
      category_id: String(product.category_id),
      name_ru: product.name_ru,
      name_uz: product.name_uz,
      name_uzc: product.name_uzc,
      description_ru: product.description_ru,
      description_uz: product.description_uz,
      description_uzc: product.description_uzc,
      material_ru: product.material_ru,
      material_uz: product.material_uz,
      material_uzc: product.material_uzc,
      image_url: product.image_url,
      pricing_type: product.pricing_type,
      price_per_m2: toText(product.price_per_m2),
      custom_size_allowed: product.custom_size_allowed,
      is_active: product.is_active,
      is_featured: product.is_featured,
      variants: (product.variants || []).map((variant) => ({
        id: variant.id,
        label: variant.label,
        width_cm: toText(variant.width_cm),
        height_cm: toText(variant.height_cm),
        price: toText(variant.price)
      })),
      colors: (product.colors || []).map((color) => ({
        id: color.id,
        name_ru: color.name_ru,
        name_uz: color.name_uz,
        name_uzc: color.name_uzc,
        hex: color.hex
      }))
    };
  }

  return {
    slug: "",
    category_id: categories[0] ? String(categories[0].id) : "",
    name_ru: "",
    name_uz: "",
    name_uzc: "",
    description_ru: "",
    description_uz: "",
    description_uzc: "",
    material_ru: "",
    material_uz: "",
    material_uzc: "",
    image_url: "",
    pricing_type: "piece",
    price_per_m2: "",
    custom_size_allowed: false,
    is_active: true,
    is_featured: false,
    variants: [emptyVariant()],
    colors: []
  };
}

export default function ProductForm({
  product,
  categories,
  t,
  lang,
  onClose,
  onSaved
}) {
  const [form, setForm] = useState(() => initialForm(product, categories));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateVariant = (index, field, value) => {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, itemIndex) =>
        itemIndex === index ? { ...variant, [field]: value } : variant
      )
    }));
  };

  const updateColor = (index, field, value) => {
    setForm((current) => ({
      ...current,
      colors: current.colors.map((color, itemIndex) =>
        itemIndex === index ? { ...color, [field]: value } : color
      )
    }));
  };

  const uploadImage = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploading(true);
    setError("");

    try {
      const body = new FormData();
      body.append("file", file);

      const result = await adminFetch("/api/admin/uploads", {
        method: "POST",
        body
      });

      update("image_url", result.url);
    } catch (uploadError) {
      setError(uploadError.message || t("formError"));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const submit = async (event) => {
    event.preventDefault();

    if (saving) {
      return;
    }

    setSaving(true);
    setError("");

    const variants = form.variants
      .filter((variant) => variant.label.trim())
      .map((variant) => ({
        id: variant.id,
        label: variant.label.trim(),
        width_cm: toNumber(variant.width_cm),
        height_cm: toNumber(variant.height_cm),
        price: toNumber(variant.price) ?? 0,
        is_active: true
      }));

    const payload = {
      slug: form.slug.trim() || null,
      category_id: Number(form.category_id),
      name_ru: form.name_ru.trim(),
      name_uz: form.name_uz.trim(),
      name_uzc: form.name_uzc.trim(),
      description_ru: form.description_ru.trim(),
      description_uz: form.description_uz.trim(),
      description_uzc: form.description_uzc.trim(),
      material_ru: form.material_ru.trim(),
      material_uz: form.material_uz.trim(),
      material_uzc: form.material_uzc.trim(),
      image_url: form.image_url.trim(),
      pricing_type: form.pricing_type,
      price_per_m2:
        form.pricing_type === "area"
          ? toNumber(form.price_per_m2)
          : null,
      custom_size_allowed: form.custom_size_allowed,
      is_active: form.is_active,
      is_featured: form.is_featured,
      variants: form.pricing_type === "area" ? [] : variants,
      colors: form.colors
        .filter(
          (color) =>
            color.name_ru.trim() &&
            color.name_uz.trim() &&
            color.name_uzc.trim()
        )
        .map((color) => ({
          id: color.id,
          name_ru: color.name_ru.trim(),
          name_uz: color.name_uz.trim(),
          name_uzc: color.name_uzc.trim(),
          hex: color.hex
        }))
    };

    try {
      const saved = await adminFetch(
        product
          ? `/api/admin/products/${product.id}`
          : "/api/admin/products",
        {
          method: product ? "PATCH" : "POST",
          body: JSON.stringify(payload)
        }
      );

      onSaved(saved);
    } catch (submitError) {
      setError(submitError.message || t("formError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <form className="product-modal" onSubmit={submit}>
        <header className="product-modal-head">
          <div>
            <h2>
              {product ? t("editProductTitle") : t("newProductTitle")}
            </h2>
            <p>{product ? product.slug : t("slugHint")}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("cancel")}
          >
            <X size={19} />
          </button>
        </header>

        <div className="product-form-body">
          <section className="form-section">
            <h3>{t("fieldImage")}</h3>

            <div className="image-upload">
              <div className="image-preview">
                {form.image_url ? (
                  <img
                    src={assetUrl(form.image_url)}
                    alt={form.name_ru || t("fieldImage")}
                  />
                ) : (
                  <ImagePlus size={26} />
                )}
              </div>

              <div className="image-actions">
                <label className="upload-button">
                  <ImagePlus size={16} />
                  {uploading ? t("uploading") : t("uploadImage")}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    disabled={uploading}
                    onChange={uploadImage}
                  />
                </label>

                <input
                  type="text"
                  value={form.image_url}
                  placeholder={t("imageUrlLabel")}
                  onChange={(event) =>
                    update("image_url", event.target.value)
                  }
                />
              </div>
            </div>
          </section>

          <section className="form-section">
            <h3>{t("fieldMain")}</h3>

            <div className="form-grid two">
              <label className="admin-field">
                <span>{t("fieldCategory")}</span>
                <select
                  value={form.category_id}
                  onChange={(event) =>
                    update("category_id", event.target.value)
                  }
                  required
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {localized(category, "name", lang)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-field">
                <span>{t("fieldSlug")}</span>
                <input
                  type="text"
                  value={form.slug}
                  placeholder="pillow-classic"
                  onChange={(event) => update("slug", event.target.value)}
                />
              </label>
            </div>

            <div className="form-grid three">
              <label className="admin-field">
                <span>{t("fieldNameRu")}</span>
                <input
                  type="text"
                  value={form.name_ru}
                  required
                  onChange={(event) => update("name_ru", event.target.value)}
                />
              </label>
              <label className="admin-field">
                <span>{t("fieldNameUz")}</span>
                <input
                  type="text"
                  value={form.name_uz}
                  required
                  onChange={(event) => update("name_uz", event.target.value)}
                />
              </label>
              <label className="admin-field">
                <span>{t("fieldNameUzc")}</span>
                <input
                  type="text"
                  value={form.name_uzc}
                  required
                  onChange={(event) => update("name_uzc", event.target.value)}
                />
              </label>
            </div>

            <div className="form-grid three">
              <label className="admin-field">
                <span>{t("fieldMaterialRu")}</span>
                <input
                  type="text"
                  value={form.material_ru}
                  onChange={(event) =>
                    update("material_ru", event.target.value)
                  }
                />
              </label>
              <label className="admin-field">
                <span>{t("fieldMaterialUz")}</span>
                <input
                  type="text"
                  value={form.material_uz}
                  onChange={(event) =>
                    update("material_uz", event.target.value)
                  }
                />
              </label>
              <label className="admin-field">
                <span>{t("fieldMaterialUzc")}</span>
                <input
                  type="text"
                  value={form.material_uzc}
                  onChange={(event) =>
                    update("material_uzc", event.target.value)
                  }
                />
              </label>
            </div>

            <div className="form-grid three">
              <label className="admin-field">
                <span>{t("fieldDescriptionRu")}</span>
                <textarea
                  rows={3}
                  value={form.description_ru}
                  onChange={(event) =>
                    update("description_ru", event.target.value)
                  }
                />
              </label>
              <label className="admin-field">
                <span>{t("fieldDescriptionUz")}</span>
                <textarea
                  rows={3}
                  value={form.description_uz}
                  onChange={(event) =>
                    update("description_uz", event.target.value)
                  }
                />
              </label>
              <label className="admin-field">
                <span>{t("fieldDescriptionUzc")}</span>
                <textarea
                  rows={3}
                  value={form.description_uzc}
                  onChange={(event) =>
                    update("description_uzc", event.target.value)
                  }
                />
              </label>
            </div>
          </section>

          <section className="form-section">
            <h3>{t("pricingType")}</h3>

            <div className="form-grid two">
              <label className="admin-field">
                <span>{t("pricingType")}</span>
                <select
                  value={form.pricing_type}
                  onChange={(event) =>
                    update("pricing_type", event.target.value)
                  }
                >
                  <option value="piece">{t("pricingPiece")}</option>
                  <option value="meter">{t("pricingMeter")}</option>
                  <option value="area">{t("pricingArea")}</option>
                </select>
              </label>

              {form.pricing_type === "area" && (
                <label className="admin-field">
                  <span>{t("pricePerM2")}</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={form.price_per_m2}
                    onChange={(event) =>
                      update("price_per_m2", event.target.value)
                    }
                    required
                  />
                </label>
              )}
            </div>

            {form.pricing_type !== "area" && (
              <>
                <div className="section-head">
                  <h4>{t("sizesTitle")}</h4>
                  <button
                    type="button"
                    className="small-button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        variants: [...current.variants, emptyVariant()]
                      }))
                    }
                  >
                    <Plus size={14} />
                    {t("addSize")}
                  </button>
                </div>

                <div className="variant-list">
                  {form.variants.map((variant, index) => (
                    <div className="variant-row" key={index}>
                      <input
                        type="text"
                        value={variant.label}
                        placeholder={t("sizeLabel")}
                        onChange={(event) =>
                          updateVariant(index, "label", event.target.value)
                        }
                      />
                      <input
                        type="number"
                        min="1"
                        value={variant.width_cm}
                        placeholder={t("sizeWidth")}
                        onChange={(event) =>
                          updateVariant(index, "width_cm", event.target.value)
                        }
                      />
                      <input
                        type="number"
                        min="1"
                        value={variant.height_cm}
                        placeholder={t("sizeHeight")}
                        onChange={(event) =>
                          updateVariant(index, "height_cm", event.target.value)
                        }
                      />
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={variant.price}
                        placeholder={t("sizePrice")}
                        onChange={(event) =>
                          updateVariant(index, "price", event.target.value)
                        }
                      />
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={t("remove")}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            variants: current.variants.filter(
                              (_, itemIndex) => itemIndex !== index
                            )
                          }))
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="form-section">
            <div className="section-head">
              <h3>{t("colorsTitle")}</h3>
              <button
                type="button"
                className="small-button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    colors: [...current.colors, emptyColor()]
                  }))
                }
              >
                <Plus size={14} />
                {t("addColor")}
              </button>
            </div>

            {form.colors.length === 0 && (
              <p className="admin-note">{t("noColors")}</p>
            )}

            <div className="color-list">
              {form.colors.map((color, index) => (
                <div className="color-row" key={index}>
                  <input
                    type="color"
                    value={color.hex}
                    onChange={(event) =>
                      updateColor(index, "hex", event.target.value)
                    }
                  />
                  <input
                    type="text"
                    value={color.name_ru}
                    placeholder={t("colorNameRu")}
                    onChange={(event) =>
                      updateColor(index, "name_ru", event.target.value)
                    }
                  />
                  <input
                    type="text"
                    value={color.name_uz}
                    placeholder={t("colorNameUz")}
                    onChange={(event) =>
                      updateColor(index, "name_uz", event.target.value)
                    }
                  />
                  <input
                    type="text"
                    value={color.name_uzc}
                    placeholder={t("colorNameUzc")}
                    onChange={(event) =>
                      updateColor(index, "name_uzc", event.target.value)
                    }
                  />
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={t("remove")}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        colors: current.colors.filter(
                          (_, itemIndex) => itemIndex !== index
                        )
                      }))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="form-section">
            <h3>{t("flagsTitle")}</h3>

            <div className="flag-list">
              <label className="flag">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) =>
                    update("is_active", event.target.checked)
                  }
                />
                {t("flagActive")}
              </label>
              <label className="flag">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(event) =>
                    update("is_featured", event.target.checked)
                  }
                />
                {t("flagFeatured")}
              </label>
              <label className="flag">
                <input
                  type="checkbox"
                  checked={form.custom_size_allowed}
                  onChange={(event) =>
                    update("custom_size_allowed", event.target.checked)
                  }
                />
                {t("flagCustom")}
              </label>
            </div>
          </section>
        </div>

        <footer className="product-modal-foot">
          {error && <p className="form-error">{error}</p>}
          <button type="button" className="ghost-button" onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            type="submit"
            className="primary-admin-button"
            disabled={saving || uploading}
          >
            {saving ? t("saving") : t("save")}
          </button>
        </footer>
      </form>
    </div>
  );
}

export function localized(item, field, lang) {
  if (!item) {
    return "";
  }

  return item[`${field}_${lang}`] || item[`${field}_ru`] || "";
}

const CURRENCY = {
  ru: "сум",
  uz: "so'm",
  uzc: "сўм"
};

export function formatPrice(value, lang = "ru") {
  const number = Math.round(Number(value) || 0);
  const groups = String(number).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return `${groups} ${CURRENCY[lang] || CURRENCY.ru}`;
}

export function assetUrl(path) {
  const base = import.meta.env.VITE_API_URL || "http://localhost:8000";

  if (!path) {
    return "";
  }

  return /^https?:\/\//i.test(path) ? path : `${base}${path}`;
}

export function priceLabel(product, t, lang) {
  const price = formatPrice(product.min_price, lang);

  if (product.pricing_type === "area") {
    return `${price} · ${t("perM2")}`;
  }

  if (product.pricing_type === "meter") {
    return `${price} · ${t("perMeter")}`;
  }

  return t("priceFrom", { price });
}

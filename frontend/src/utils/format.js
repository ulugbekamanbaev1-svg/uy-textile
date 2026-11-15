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

export function formatNumber(value) {
  return String(Math.round(Number(value) || 0)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    " "
  );
}

export function formatArea(widthCm, heightCm) {
  const area = (Number(widthCm) * Number(heightCm)) / 10000;

  return area.toFixed(2);
}

export function toNumber(value) {
  const parsed = Number(String(value).replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

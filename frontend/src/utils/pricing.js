export function quantityValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function formatQuantity(value) {
  const number = Math.round(quantityValue(value) * 100) / 100;
  return String(number).replace(".", ",");
}

export function pickPriceTier(tiers, amount) {
  const value = quantityValue(amount);
  const list = (Array.isArray(tiers) ? tiers : []).filter(
    (tier) => value + 1e-9 >= quantityValue(tier.min_quantity)
  );

  if (list.length === 0) {
    return null;
  }

  return list.reduce((best, tier) =>
    quantityValue(tier.min_quantity) > quantityValue(best.min_quantity)
      ? tier
      : best
  );
}

export function itemAmount(item) {
  if (!item) return 0;

  if (item.pricingType === "meter") {
    return quantityValue(item.meters);
  }

  if (item.pricingType === "area") {
    return quantityValue(item.area) * quantityValue(item.qty);
  }

  return quantityValue(item.qty);
}

export function itemBasePrice(item) {
  return quantityValue(item?.basePrice ?? item?.unitPrice);
}

export function itemUnitPrice(item) {
  const tier = pickPriceTier(item?.tiers, itemAmount(item));

  return tier ? quantityValue(tier.price) : itemBasePrice(item);
}

export function itemLineTotal(item) {
  return Math.round(itemUnitPrice(item) * itemAmount(item));
}

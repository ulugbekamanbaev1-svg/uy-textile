import { ImageOff } from "lucide-react";

import { assetUrl } from "../services/api";
import { formatPrice, localized } from "../utils/format";
import { formatQuantity, quantityValue } from "../utils/pricing";
import { FavoriteButton } from "./TopBar";

export default function ProductCard({
  product,
  t,
  lang,
  favorite,
  onToggleFavorite,
  onOpen
}) {
  const name = localized(product, "name", lang);
  const price = formatPrice(product.min_price, lang);

  const priceLabel =
    product.pricing_type === "area"
      ? `${price} · ${t("perM2")}`
      : product.pricing_type === "meter"
        ? `${price} · ${t("perMeter")}`
        : t("fromPrice", { price });

  const tiers = Array.isArray(product.price_tiers) ? product.price_tiers : [];
  const firstTier = tiers.length
    ? tiers.reduce((best, tier) =>
        quantityValue(tier.min_quantity) < quantityValue(best.min_quantity)
          ? tier
          : best
      )
    : null;
  const wholesaleBestPrice = tiers.length
    ? Math.min(...tiers.map((tier) => quantityValue(tier.price)))
    : null;
  const unit =
    product.pricing_type === "meter"
      ? t("meterUnit")
      : product.pricing_type === "area"
        ? `${t("meterUnit")}²`
        : t("pieceUnit");

  const handlePointerMove = (event) => {
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") {
      return;
    }

    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const rotateY = (x - 0.5) * 8;
    const rotateX = (0.5 - y) * 8;

    card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
  };

  const handlePointerLeave = (event) => {
    event.currentTarget.style.transform = "";
  };

  return (
    <article
      className="product-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(product.slug)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(product.slug);
      }}
    >
      <div className="product-image">
        {product.image_url ? (
          <img src={assetUrl(product.image_url)} alt={name} />
        ) : (
          <ImageOff size={28} />
        )}
        <div className="product-badges">
          {product.is_featured && (
            <span className="product-badge featured">{t("featuredBadge")}</span>
          )}
          {firstTier && (
            <span className="product-badge wholesale">
              {t("wholesaleFromBadge", {
                quantity: formatQuantity(firstTier.min_quantity),
                unit
              })}
            </span>
          )}
        </div>
        {product.in_stock === false && (
          <span className="out-of-stock-badge">{t("outOfStock")}</span>
        )}
        <FavoriteButton
          active={favorite}
          label={t("favorites")}
          onClick={() => onToggleFavorite(product)}
        />
      </div>

      <div className="product-card-body">
        <span className="product-category">
          {localized(product, "category_name", lang)}
        </span>
        <h3>{name}</h3>
        <p className="product-price">{priceLabel}</p>
        {wholesaleBestPrice !== null &&
          wholesaleBestPrice < quantityValue(product.min_price) && (
            <p className="product-price wholesale">
              {t("wholesalePriceFrom", {
                price: formatPrice(wholesaleBestPrice, lang),
                unit
              })}
            </p>
          )}
      </div>
    </article>
  );
}

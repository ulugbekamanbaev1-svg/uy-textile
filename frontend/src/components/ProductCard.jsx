import { ImageOff } from "lucide-react";

import { assetUrl } from "../services/api";
import { formatPrice, localized } from "../utils/format";
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

  return (
    <article
      className="product-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(product.slug)}
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
      </div>
    </article>
  );
}

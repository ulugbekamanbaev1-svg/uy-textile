import { Heart } from "lucide-react";

import ProductCard from "../components/ProductCard";

export default function FavoritesPage({
  t,
  lang,
  items,
  onOpenProduct,
  isFavorite,
  onToggleFavorite,
  onGoShopping
}) {
  return (
    <main>
      <div className="page-heading">
        <span className="eyebrow">UY TEXTILE</span>
        <h2>{t("favoritesTitle")}</h2>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <Heart size={30} />
          <p className="empty-title">{t("favoritesEmpty")}</p>
          <p className="empty-hint">{t("favoritesHint")}</p>
          <button className="primary-button" type="button" onClick={onGoShopping}>
            {t("goShopping")}
          </button>
        </div>
      ) : (
        <div className="product-grid">
          {items.map((product) => (
            <ProductCard
              key={product.slug}
              product={product}
              t={t}
              lang={lang}
              favorite={isFavorite(product.slug)}
              onToggleFavorite={onToggleFavorite}
              onOpen={onOpenProduct}
            />
          ))}
        </div>
      )}
    </main>
  );
}

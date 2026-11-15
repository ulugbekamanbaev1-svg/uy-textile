import { ArrowRight, Search } from "lucide-react";

import ProductCard from "../components/ProductCard";
import { localized } from "../utils/format";

export default function HomePage({
  t,
  lang,
  categories,
  products,
  onOpenProduct,
  onOpenCategory,
  isFavorite,
  onToggleFavorite
}) {
  const featured = products.filter((product) => product.is_featured).slice(0, 4);

  return (
    <main>
      <section className="hero">
        <span className="eyebrow">{t("heroEyebrow")}</span>
        <h2>{t("heroTitle")}</h2>
        <p>{t("heroText")}</p>
        <button
          className="primary-button"
          type="button"
          onClick={() => onOpenCategory("")}
        >
          {t("goCatalog")}
          <ArrowRight size={16} />
        </button>
      </section>

      <section className="categories">
        <div className="section-heading">
          <div>
            <span className="eyebrow">UY TEXTILE</span>
            <h2>{t("catalogTitle")}</h2>
          </div>
          <button
            className="ghost-icon-button"
            type="button"
            onClick={() => onOpenCategory("")}
            aria-label={t("searchPlaceholder")}
          >
            <Search size={20} />
          </button>
        </div>

        <div className="category-grid">
          {categories.map((category, index) => (
            <button
              className="category-card"
              key={category.slug}
              type="button"
              onClick={() => onOpenCategory(category.slug)}
            >
              <span className="category-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{localized(category, "name", lang)}</span>
              <span className="category-count">
                {category.product_count}
              </span>
            </button>
          ))}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="home-products">
          <div className="section-heading">
            <h2>{t("popularTitle")}</h2>
            <button
              className="link-button"
              type="button"
              onClick={() => onOpenCategory("")}
            >
              {t("goCatalog")}
            </button>
          </div>

          <div className="product-grid">
            {featured.map((product) => (
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
        </section>
      )}
    </main>
  );
}

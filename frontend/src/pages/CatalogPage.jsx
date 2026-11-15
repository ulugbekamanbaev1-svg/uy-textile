import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import ProductCard from "../components/ProductCard";
import { localized } from "../utils/format";

export default function CatalogPage({
  t,
  lang,
  categories,
  products,
  activeCategory,
  onCategoryChange,
  onOpenProduct,
  isFavorite,
  onToggleFavorite
}) {
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchCategory =
        !activeCategory || product.category_slug === activeCategory;

      if (!matchCategory) {
        return false;
      }

      if (!query) {
        return true;
      }

      return ["ru", "uz", "uzc"].some((code) =>
        (product[`name_${code}`] || "").toLowerCase().includes(query)
      );
    });
  }, [products, activeCategory, search]);

  return (
    <main>
      <section className="page-heading">
        <span className="eyebrow">UY TEXTILE</span>
        <h2>{t("catalogTitle")}</h2>
        <p>{t("catalogSubtitle")}</p>
      </section>

      <div className="search-field">
        <Search size={18} />
        <input
          type="search"
          value={search}
          placeholder={t("searchPlaceholder")}
          onChange={(event) => setSearch(event.target.value)}
        />
        {search && (
          <button type="button" onClick={() => setSearch("")}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className="chip-row">
        <button
          type="button"
          className={`chip${activeCategory === "" ? " active" : ""}`}
          onClick={() => onCategoryChange("")}
        >
          {t("catAll")}
        </button>
        {categories.map((category) => (
          <button
            key={category.slug}
            type="button"
            className={`chip${
              activeCategory === category.slug ? " active" : ""
            }`}
            onClick={() => onCategoryChange(category.slug)}
          >
            {localized(category, "name", lang)}
          </button>
        ))}
      </div>

      <p className="result-count">
        {t("productsFound", { count: visible.length })}
      </p>

      {visible.length === 0 ? (
        <div className="empty-state">
          <p>{t("nothingFound")}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setSearch("");
              onCategoryChange("");
            }}
          >
            {t("resetFilters")}
          </button>
        </div>
      ) : (
        <div className="product-grid">
          {visible.map((product) => (
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

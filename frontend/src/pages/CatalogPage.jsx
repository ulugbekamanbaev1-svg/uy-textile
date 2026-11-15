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
  const [sort, setSort] = useState("default");

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = products.filter((product) => {
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

    const sorted = [...filtered];

    if (sort === "price_asc") {
      sorted.sort((a, b) => (a.min_price || 0) - (b.min_price || 0));
    } else if (sort === "price_desc") {
      sorted.sort((a, b) => (b.min_price || 0) - (a.min_price || 0));
    } else if (sort === "newest") {
      sorted.sort((a, b) => (b.id || 0) - (a.id || 0));
    }

    return sorted;
  }, [products, activeCategory, search, sort]);

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

      <div className="catalog-toolbar">
        <p className="result-count">
          {t("productsFound", { count: visible.length })}
        </p>
        <select
          className="sort-select"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label={t("sortLabel")}
        >
          <option value="default">{t("sortDefault")}</option>
          <option value="price_asc">{t("sortPriceAsc")}</option>
          <option value="price_desc">{t("sortPriceDesc")}</option>
          <option value="newest">{t("sortNewest")}</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <p>{t("nothingFound")}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setSearch("");
              setSort("default");
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

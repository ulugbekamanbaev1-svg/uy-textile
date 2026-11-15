import { ArrowRight } from "lucide-react";

import ProductCard from "../components/ProductCard";

export default function HomePage({
  t,
  lang,
  categories,
  products,
  hero,
  onOpenProduct,
  onOpenCategory,
  isFavorite,
  onToggleFavorite
}) {
  const featured = products.filter((product) => product.is_featured).slice(0, 4);
  const localeCode = lang === "uzc" ? "uzc" : lang === "uz" ? "uz" : "ru";
  const heroTitle = hero?.[`hero_title_${localeCode}`] || t("heroTitle");
  const heroText = hero?.[`hero_text_${localeCode}`] || t("heroText");

  const bannerText = hero?.[`banner_text_${localeCode}`] || "";
  const showBanner = Boolean(hero?.banner_active && bannerText.trim());

  return (
    <main>
      {showBanner && (
        <button
          className="promo-banner"
          type="button"
          onClick={() => onOpenCategory(hero.banner_category || "")}
        >
          <span>{bannerText}</span>
          <ArrowRight size={16} />
        </button>
      )}

      <section className="hero hero-with-photo">
        <span className="eyebrow">{t("heroEyebrow")}</span>
        <h2>{heroTitle}</h2>
        <p>{heroText}</p>
        <button
          className="primary-button"
          type="button"
          onClick={() => onOpenCategory("")}
        >
          {t("goCatalog")}
          <ArrowRight size={16} />
        </button>
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

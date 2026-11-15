import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ImageOff,
  ShoppingBag,
  WifiOff
} from "lucide-react";

import QuantityStepper from "../components/QuantityStepper";
import { FavoriteButton } from "../components/TopBar";
import { assetUrl, fetchProduct } from "../services/api";
import { formatArea, formatPrice, localized, toNumber } from "../utils/format";

const MIN_CM = 20;
const MAX_CM = 400;

export default function ProductPage({
  slug,
  t,
  lang,
  onBack,
  onAddToCart,
  favorite,
  onToggleFavorite
}) {
  const [product, setProduct] = useState(null);
  const [state, setState] = useState("loading");
  const [variantId, setVariantId] = useState(null);
  const [colorId, setColorId] = useState(null);
  const [width, setWidth] = useState("50");
  const [height, setHeight] = useState("70");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const load = () => {
    setState("loading");
    fetchProduct(slug)
      .then((data) => {
        setProduct(data);
        const firstVariant = data.variants[0];
        setVariantId(firstVariant ? firstVariant.id : null);
        setColorId(data.colors.length ? data.colors[0].id : null);
        setState("ready");
      })
      .catch(() => setState("error"));
  };

  useEffect(() => {
    load();
    setQty(1);
    setAdded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!added) return undefined;
    const timer = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(timer);
  }, [added]);

  const variant = product?.variants.find((item) => item.id === variantId);
  const color = product?.colors.find((item) => item.id === colorId);

  const area = useMemo(() => {
    const w = toNumber(width);
    const h = toNumber(height);

    if (w < MIN_CM || h < MIN_CM || w > MAX_CM || h > MAX_CM) {
      return 0;
    }

    return (w * h) / 10000;
  }, [width, height]);

  const unitPrice = useMemo(() => {
    if (!product) return 0;

    if (product.pricing_type === "area") {
      return Math.round(area * (product.price_per_m2 || 0));
    }

    return variant ? variant.price : product.min_price;
  }, [product, variant, area]);

  if (state === "loading") {
    return (
      <main>
        <BackBar t={t} onBack={onBack} />
        <div className="skeleton">
          <div className="skeleton-image" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
        </div>
        <p className="result-count">{t("loading")}</p>
      </main>
    );
  }

  if (state === "error" || !product) {
    return (
      <main>
        <BackBar t={t} onBack={onBack} />
        <div className="empty-state">
          <WifiOff size={28} />
          <p>{t("errorLoading")}</p>
          <button className="primary-button" type="button" onClick={load}>
            {t("retry")}
          </button>
        </div>
      </main>
    );
  }

  const name = localized(product, "name", lang);
  const isCustom = product.pricing_type === "area";
  const customValid = !isCustom || area > 0;
  const canAdd = customValid && unitPrice > 0 && product.in_stock !== false;

  const handleAdd = () => {
    if (!canAdd) return;

    onAddToCart(
      {
        key: [
          product.slug,
          isCustom ? `${width}x${height}` : variantId,
          colorId
        ].join("|"),
        slug: product.slug,
        productId: product.id,
        name_ru: product.name_ru,
        name_uz: product.name_uz,
        name_uzc: product.name_uzc,
        image_url: product.image_url,
        variantId: isCustom ? null : variantId,
        colorId,
        widthCm: isCustom ? toNumber(width) : variant?.width_cm ?? null,
        heightCm: isCustom ? toNumber(height) : variant?.height_cm ?? null,
        variantLabel: isCustom
          ? `${width}×${height} см`
          : variant?.label || "",
        color_ru: color?.name_ru || "",
        color_uz: color?.name_uz || "",
        color_uzc: color?.name_uzc || "",
        colorHex: color?.hex || "",
        pricingType: product.pricing_type,
        unitPrice
      },
      qty
    );

    setAdded(true);
  };

  return (
    <main>
      <BackBar t={t} onBack={onBack} />

      <div className="product-hero">
        {product.image_url ? (
          <img src={assetUrl(product.image_url)} alt={name} />
        ) : (
          <ImageOff size={40} />
        )}
        <FavoriteButton
          active={favorite}
          label={t("favorites")}
          onClick={() => onToggleFavorite(product)}
        />
      </div>

      <span className="product-category">
        {localized(product, "category_name", lang)}
      </span>
      <h1 className="product-title">{name}</h1>
      {product.in_stock === false && (
        <p className="form-error">{t("outOfStockMessage")}</p>
      )}
      <p className="product-description">
        {localized(product, "description", lang)}
      </p>

      <div className="spec-row">
        <span>{t("productMaterial")}</span>
        <strong>{localized(product, "material", lang)}</strong>
      </div>

      {isCustom ? (
        <section className="option-block">
          <h3>{t("customSizeTitle")}</h3>
          <p className="option-hint">{t("customSizeHint")}</p>

          <div className="size-inputs">
            <label>
              {t("widthCm")}
              <input
                type="number"
                inputMode="numeric"
                min={MIN_CM}
                max={MAX_CM}
                value={width}
                onChange={(event) => setWidth(event.target.value)}
              />
            </label>
            <label>
              {t("heightCm")}
              <input
                type="number"
                inputMode="numeric"
                min={MIN_CM}
                max={MAX_CM}
                value={height}
                onChange={(event) => setHeight(event.target.value)}
              />
            </label>
          </div>

          <div className="calc-box">
            <div>
              <span>{t("areaLabel")}</span>
              <strong>{area > 0 ? `${formatArea(width, height)} м²` : "—"}</strong>
            </div>
            <div>
              <span>{t("perM2")}</span>
              <strong>{formatPrice(product.price_per_m2, lang)}</strong>
            </div>
            <div>
              <span>{t("calcPrice")}</span>
              <strong>{formatPrice(unitPrice, lang)}</strong>
            </div>
          </div>

          {!customValid && (
            <p className="form-error">
              {MIN_CM}–{MAX_CM} см
            </p>
          )}
        </section>
      ) : (
        product.variants.length > 0 && (
          <section className="option-block">
            <h3>{t("productSizes")}</h3>
            <div className="option-row">
              {product.variants.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`option-button${
                    item.id === variantId ? " active" : ""
                  }`}
                  onClick={() => setVariantId(item.id)}
                >
                  <span>{item.label}</span>
                  <strong>{formatPrice(item.price, lang)}</strong>
                </button>
              ))}
            </div>
          </section>
        )
      )}

      {product.colors.length > 0 && (
        <section className="option-block">
          <h3>{t("productColors")}</h3>
          <div className="color-row">
            {product.colors.map((item) => (
              <button
                key={item.id}
                type="button"
                title={localized(item, "name", lang)}
                className={`color-dot${
                  item.id === colorId ? " active" : ""
                }`}
                style={{ background: item.hex }}
                onClick={() => setColorId(item.id)}
              >
                {item.id === colorId && <Check size={13} />}
              </button>
            ))}
          </div>
          {color && <p className="color-name">{localized(color, "name", lang)}</p>}
        </section>
      )}

      <section className="buy-block">
        <div className="buy-row">
          <div>
            <span className="buy-label">{t("quantity")}</span>
            <QuantityStepper value={qty} onChange={setQty} />
          </div>
          <div className="buy-total">
            <span className="buy-label">{t("total")}</span>
            <strong>{formatPrice(unitPrice * qty, lang)}</strong>
          </div>
        </div>

        <button
          className={`add-button${added ? " added" : ""}`}
          type="button"
          disabled={!canAdd}
          onClick={handleAdd}
        >
          {added ? <Check size={18} /> : <ShoppingBag size={18} />}
          {product.in_stock === false
            ? t("outOfStock")
            : added
              ? t("addedToCart")
              : t("addToCart")}
        </button>
      </section>
    </main>
  );
}

function BackBar({ t, onBack }) {
  return (
    <button className="back-button" type="button" onClick={onBack}>
      <ArrowLeft size={18} />
      {t("back")}
    </button>
  );
}

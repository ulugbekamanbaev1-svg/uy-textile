import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  ShoppingBag,
  WifiOff
} from "lucide-react";

import QuantityStepper from "../components/QuantityStepper";
import { FavoriteButton } from "../components/TopBar";
import { assetUrl, fetchProduct } from "../services/api";
import { formatArea, formatPrice, localized, toNumber } from "../utils/format";
import {
  formatQuantity,
  nextWholesaleTier,
  pickPriceTier,
  quantityValue
} from "../utils/pricing";

const MIN_CM = 20;
const MAX_CM = 400;
const MIN_METERS = 0.5;
const MAX_METERS = 9999;
const METER_PRESETS = [1, 2, 3, 5, 10, 15, 20];

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
  const [meters, setMeters] = useState("1");
  const [qty, setQty] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const [added, setAdded] = useState(false);

  const load = () => {
    setState("loading");
    fetchProduct(slug)
      .then((data) => {
        setProduct(data);
        const firstVariant = data.variants[0];
        setVariantId(firstVariant ? firstVariant.id : null);
        setColorId(data.colors.length ? data.colors[0].id : null);
        setImageIndex(0);
        setState("ready");
      })
      .catch(() => setState("error"));
  };

  useEffect(() => {
    load();
    setQty(1);
    setMeters("1");
    setAdded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!added) return undefined;
    const timer = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(timer);
  }, [added]);

  const gallery = useMemo(() => {
    const urls = [];
    const add = (url) => {
      if (url && !urls.includes(url)) urls.push(url);
    };

    add(product?.image_url);
    (product?.images || []).forEach((image) => add(image.url));

    return urls;
  }, [product]);

  const variant = product?.variants.find((item) => item.id === variantId);
  const color = product?.colors.find((item) => item.id === colorId);

  const isArea = product?.pricing_type === "area";
  const isMeter = product?.pricing_type === "meter";
  const isPiece = !isArea && !isMeter;

  const area = useMemo(() => {
    const w = toNumber(width);
    const h = toNumber(height);

    if (w < MIN_CM || h < MIN_CM || w > MAX_CM || h > MAX_CM) {
      return 0;
    }

    return (w * h) / 10000;
  }, [width, height]);

  const metersNumber = quantityValue(String(meters).replace(",", "."));
  const metersValid =
    metersNumber >= MIN_METERS && metersNumber <= MAX_METERS;

  const amount = isMeter
    ? metersNumber
    : isArea
      ? area * qty
      : qty;

  const basePrice = useMemo(() => {
    if (!product) return 0;

    if (isArea) {
      return product.price_per_m2 || 0;
    }

    return variant ? variant.price : product.min_price;
  }, [product, variant, isArea]);

  const activeTier = pickPriceTier(product?.price_tiers, amount);
  const unitPrice = activeTier
    ? quantityValue(activeTier.price)
    : quantityValue(basePrice);
  const lineTotal = Math.round(unitPrice * amount);
  const hasDiscount = unitPrice > 0 && unitPrice < quantityValue(basePrice);
  const savings = Math.max(0, Math.round((basePrice - unitPrice) * amount));
  const nextTier = nextWholesaleTier(product?.price_tiers, amount);
  const amountToNext =
    nextTier && amount > 0
      ? Math.max(0, quantityValue(nextTier.min_quantity) - amount)
      : 0;
  const nextTierTotal =
    nextTier && amount > 0
      ? Math.round(quantityValue(nextTier.min_quantity) * quantityValue(nextTier.price))
      : 0;

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
  const customValid = !isArea || area > 0;
  const canAdd =
    customValid &&
    (!isMeter || metersValid) &&
    unitPrice > 0 &&
    product.in_stock !== false;

  const unitLabel = isMeter
    ? t("meterUnit")
    : isArea
      ? `${t("meterUnit")}²`
      : t("pieceUnit");

  const handleAdd = () => {
    if (!canAdd) return;

    const key = [
      product.slug,
      isMeter
        ? `m-${variantId ?? "default"}`
        : isArea
          ? `${width}x${height}`
          : variantId,
      colorId
    ].join("|");

    onAddToCart(
      {
        key,
        slug: product.slug,
        productId: product.id,
        name_ru: product.name_ru,
        name_uz: product.name_uz,
        name_uzc: product.name_uzc,
        image_url: product.image_url,
        variantId: isArea ? null : variantId,
        colorId,
        widthCm: isArea
          ? toNumber(width)
          : isMeter
            ? variant?.width_cm ?? null
            : variant?.width_cm ?? null,
        heightCm: isArea
          ? toNumber(height)
          : isMeter
            ? null
            : variant?.height_cm ?? null,
        meters: isMeter ? metersNumber : null,
        area: isArea ? area : null,
        variantLabel: isArea
          ? `${width}×${height} ${t("cmShort")}`
          : variant?.label || "",
        color_ru: color?.name_ru || "",
        color_uz: color?.name_uz || "",
        color_uzc: color?.name_uzc || "",
        colorHex: color?.hex || "",
        pricingType: product.pricing_type,
        basePrice,
        tiers: product.price_tiers || [],
        unitPrice,
        qty: isMeter ? 1 : qty
      },
      isMeter ? 1 : qty
    );

    try {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
    } catch {
      // ignore
    }

    setAdded(true);
  };

  const showGallery = gallery.length > 0;
  const currentImage = gallery[imageIndex] || "";

  const moveImage = (direction) => {
    if (gallery.length < 2) return;
    setImageIndex(
      (current) =>
        (current + direction + gallery.length) % gallery.length
    );
  };

  return (
    <main>
      <BackBar t={t} onBack={onBack} />

      <div className="product-hero product-gallery">
        {showGallery ? (
          <img src={assetUrl(currentImage)} alt={name} />
        ) : (
          <ImageOff size={40} />
        )}

        {gallery.length > 1 && (
          <>
            <button
              type="button"
              className="gallery-arrow left"
              aria-label={t("galleryPrev")}
              onClick={() => moveImage(-1)}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className="gallery-arrow right"
              aria-label={t("galleryNext")}
              onClick={() => moveImage(1)}
            >
              <ChevronRight size={20} />
            </button>
            <span className="gallery-counter">
              {imageIndex + 1} / {gallery.length}
            </span>
          </>
        )}

        <FavoriteButton
          active={favorite}
          label={t("favorites")}
          onClick={() => onToggleFavorite(product)}
        />
      </div>

      {gallery.length > 1 && (
        <div className="gallery-thumbs">
          {gallery.map((url, index) => (
            <button
              key={`${url}-${index}`}
              type="button"
              className={`gallery-thumb${index === imageIndex ? " active" : ""}`}
              onClick={() => setImageIndex(index)}
            >
              <img src={assetUrl(url)} alt={`${name} ${index + 1}`} />
            </button>
          ))}
        </div>
      )}

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

      {isArea && (
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
              <span>{t("retailPriceLabel")}</span>
              <strong>{formatPrice(basePrice, lang)} / {t("meterUnit")}²</strong>
            </div>
            {hasDiscount && (
              <div>
                <span>{t("yourPriceLabel")}</span>
                <strong>
                  {formatPrice(unitPrice, lang)} / {t("meterUnit")}²
                </strong>
              </div>
            )}
            <div>
              <span>{t("calcPrice")}</span>
              <strong>{formatPrice(lineTotal, lang)}</strong>
            </div>
          </div>

          {hasDiscount && (
            <p className="wholesale-saved">
              {t("wholesaleBadge")} · {t("wholesaleSaved", {
                amount: formatPrice(savings, lang)
              })}
            </p>
          )}

          {nextTier && amount > 0 && !hasDiscount && amountToNext > 1e-9 && (
            <p className="wholesale-hint-next">
              {t("wholesaleNextHint", {
                amount: formatQuantity(amountToNext),
                unit: `${t("meterUnit")}²`,
                price: formatPrice(quantityValue(nextTier.price), lang)
              })}
            </p>
          )}

          {!customValid && (
            <p className="form-error">
              {MIN_CM}–{MAX_CM} {t("cmShort")}
            </p>
          )}
        </section>
      )}

      {isMeter && product.variants.length > 0 && (
        <section className="option-block">
          <h3>{t("fabricWidth")}</h3>
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
                <strong>
                  {formatPrice(item.price, lang)} / {t("meterUnit")}
                </strong>
              </button>
            ))}
          </div>
        </section>
      )}

      {isPiece && !isArea && product.variants.length > 0 && (
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
      )}

      {isMeter && (
        <section className="option-block">
          <h3>{t("metersLabel")}</h3>
          <p className="option-hint">{t("metersHint")}</p>

          <div className="meters-input-row">
            <input
              type="number"
              inputMode="decimal"
              min={MIN_METERS}
              max={MAX_METERS}
              step="0.5"
              value={meters}
              onChange={(event) => setMeters(event.target.value)}
            />
            <span>{t("meterUnit")}</span>
          </div>

          <div className="meter-presets">
            {METER_PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                className={`meter-chip${
                  Number(meters) === value ? " active" : ""
                }`}
                onClick={() => setMeters(String(value))}
              >
                {value} {t("meterUnit")}
              </button>
            ))}
          </div>

          <div className="calc-box">
            <div>
              <span>{t("quantity")}</span>
              <strong>
                {formatQuantity(metersNumber)} {t("meterUnit")}
              </strong>
            </div>
            <div>
              <span>{t("retailPriceLabel")}</span>
              <strong>{formatPrice(basePrice, lang)} / {t("meterUnit")}</strong>
            </div>
            {hasDiscount && (
              <div>
                <span>{t("yourPriceLabel")}</span>
                <strong>{formatPrice(unitPrice, lang)} / {t("meterUnit")}</strong>
              </div>
            )}
            <div>
              <span>{t("calcPrice")}</span>
              <strong>{formatPrice(lineTotal, lang)}</strong>
            </div>
          </div>

          {hasDiscount && (
            <p className="wholesale-saved">
              {t("wholesaleBadge")} · {t("wholesaleSaved", {
                amount: formatPrice(savings, lang)
              })}
            </p>
          )}

          {nextTier && amount > 0 && !hasDiscount && amountToNext > 1e-9 && (
            <p className="wholesale-hint-next">
              {t("wholesaleNextHint", {
                amount: formatQuantity(amountToNext),
                unit: t("meterUnit"),
                price: formatPrice(quantityValue(nextTier.price), lang)
              })}
            </p>
          )}

          {!metersValid && (
            <p className="form-error">
              {t("metersMin", { min: MIN_METERS })}
            </p>
          )}
        </section>
      )}

      {product.price_tiers?.length > 0 && (
        <section className="option-block wholesale-block">
          <h3>{t("wholesaleTitle")}</h3>
          <p className="option-hint">{t("wholesaleHint")}</p>

          <div className="tier-list">
            {product.price_tiers.map((tier) => {
              const active =
                activeTier &&
                quantityValue(activeTier.min_quantity) ===
                  quantityValue(tier.min_quantity);
              const range =
                tier.max_quantity !== null && tier.max_quantity !== undefined
                  ? `${formatQuantity(tier.min_quantity)}–${formatQuantity(
                      tier.max_quantity
                    )}`
                  : t("wholesaleFrom", {
                      quantity: formatQuantity(tier.min_quantity)
                    });

              return (
                <div
                  key={tier.id ?? tier.min_quantity}
                  className={`tier-row${active ? " active" : ""}`}
                >
                  <span>
                    {range} {unitLabel}
                  </span>
                  <strong>
                    {formatPrice(tier.price, lang)} / {unitLabel}
                  </strong>
                  {active && (
                    <span className="tier-badge">{t("wholesaleBadge")}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
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
            {isMeter ? (
              <strong>
                {formatQuantity(metersNumber)} {t("meterUnit")}
              </strong>
            ) : (
              <QuantityStepper value={qty} onChange={setQty} />
            )}
          </div>
          <div className="buy-total">
            <span className="buy-label">{t("total")}</span>
            <strong>{formatPrice(lineTotal, lang)}</strong>
          </div>
        </div>

        {isPiece && hasDiscount && (
          <p className="wholesale-saved">
            {t("wholesaleBadge")} · {t("wholesaleSaved", {
              amount: formatPrice(savings, lang)
            })}
          </p>
        )}

        {isPiece && nextTier && !hasDiscount && amountToNext > 1e-9 && (
          <p className="wholesale-hint-next">
            {t("wholesaleNextHint", {
              amount: formatQuantity(amountToNext),
              unit: t("pieceUnit"),
              price: formatPrice(quantityValue(nextTier.price), lang)
            })}
          </p>
        )}

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

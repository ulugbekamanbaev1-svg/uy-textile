import { ImageOff, ShoppingBag, Trash2 } from "lucide-react";

import QuantityStepper from "../components/QuantityStepper";
import { assetUrl } from "../services/api";
import { formatPrice, localized } from "../utils/format";
import {
  formatQuantity,
  hasWholesaleDiscount,
  itemAmount,
  itemBasePrice,
  itemLineTotal,
  itemUnitPrice
} from "../utils/pricing";

export default function CartPage({
  t,
  lang,
  items,
  count,
  onSetQty,
  onSetMeters,
  onRemove,
  onClear,
  onGoShopping,
  onOpenProduct,
  onCheckout,
  total
}) {
  if (items.length === 0) {
    return (
      <main>
        <div className="page-heading">
          <span className="eyebrow">UY TEXTILE</span>
          <h2>{t("cartTitle")}</h2>
        </div>

        <div className="empty-state">
          <ShoppingBag size={30} />
          <p className="empty-title">{t("cartEmpty")}</p>
          <p className="empty-hint">{t("cartEmptyHint")}</p>
          <button
            className="primary-button"
            type="button"
            onClick={onGoShopping}
          >
            {t("goShopping")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="page-heading cart-heading">
        <div>
          <span className="eyebrow">UY TEXTILE</span>
          <h2>{t("cartTitle")}</h2>
          <p>{t("itemsCount", { count })}</p>
        </div>
        <button className="link-button danger" type="button" onClick={onClear}>
          {t("cartClear")}
        </button>
      </div>

      <div className="cart-list">
        {items.map((item) => {
          const isMeter = item.pricingType === "meter";
          const isArea = item.pricingType === "area";
          const unitPrice = itemUnitPrice(item);
          const basePrice = itemBasePrice(item);
          const discounted = hasWholesaleDiscount(item);

          return (
            <article className="cart-item" key={item.key}>
              <button
                className="cart-thumb"
                type="button"
                onClick={() => onOpenProduct(item.slug)}
              >
                {item.image_url ? (
                  <img
                    src={assetUrl(item.image_url)}
                    alt={localized(item, "name", lang)}
                  />
                ) : (
                  <ImageOff size={22} />
                )}
              </button>

              <div className="cart-item-body">
                <h3>{localized(item, "name", lang)}</h3>

                <p className="cart-meta">
                  {(item.variantLabel || "").replace("см", t("cmShort"))}
                  {item.colorHex && (
                    <span
                      className="inline-color"
                      style={{ background: item.colorHex }}
                      title={localized(item, "color", lang)}
                    />
                  )}
                  {localized(item, "color", lang) &&
                    ` · ${localized(item, "color", lang)}`}
                </p>

                {isArea && (
                  <p className="cart-meta">
                    {formatQuantity(item.widthCm)}×{formatQuantity(item.heightCm)}{" "}
                    {t("cmShort")} · {formatQuantity(item.area)}{" "}
                    {t("meterUnit")}²
                  </p>
                )}

                <p className="cart-unit">
                  {formatPrice(unitPrice, lang)}
                  {isMeter && ` / ${t("meterUnit")}`}
                  {isArea && ` / ${t("meterUnit")}²`}
                  {discounted && (
                    <s className="old-price">{formatPrice(basePrice, lang)}</s>
                  )}
                </p>

                {isMeter ? (
                  <div className="meters-input-row compact">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.5"
                      max="9999"
                      step="0.5"
                      value={item.meters ?? ""}
                      onChange={(event) =>
                        onSetMeters(item.key, event.target.value)
                      }
                    />
                    <span>{t("meterUnit")}</span>
                  </div>
                ) : (
                  <div className="cart-item-footer cart-item-footer-qty">
                    <QuantityStepper
                      value={item.qty}
                      onChange={(value) => onSetQty(item.key, value)}
                    />
                    <strong>{formatPrice(itemLineTotal(item), lang)}</strong>
                    <button
                      className="remove-button"
                      type="button"
                      aria-label={t("remove")}
                      onClick={() => onRemove(item.key)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}

                {isMeter && (
                  <div className="cart-item-footer">
                    <strong>{formatPrice(itemLineTotal(item), lang)}</strong>
                    <button
                      className="remove-button"
                      type="button"
                      aria-label={t("remove")}
                      onClick={() => onRemove(item.key)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}

                {discounted && (
                  <p className="wholesale-saved">
                    {t("wholesaleBadge")} ·{" "}
                    {t("wholesaleSaved", {
                      amount: formatPrice(
                        Math.round((basePrice - unitPrice) * itemAmount(item)),
                        lang
                      )
                    })}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <section className="cart-summary">
        <div className="summary-row">
          <span>{t("subtotal")}</span>
          <strong>{formatPrice(total, lang)}</strong>
        </div>

        <p className="delivery-note">{t("deliveryNote")}</p>

        <button className="add-button" type="button" onClick={onCheckout}>
          {t("checkout")}
        </button>
        <p className="soon-note">{t("checkoutNote")}</p>
      </section>
    </main>
  );
}

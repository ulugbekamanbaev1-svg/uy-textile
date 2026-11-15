import { ImageOff, ShoppingBag, Trash2 } from "lucide-react";

import QuantityStepper from "../components/QuantityStepper";
import { assetUrl } from "../services/api";
import { formatPrice, localized } from "../utils/format";

export default function CartPage({
  t,
  lang,
  items,
  count,
  onSetQty,
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
        {items.map((item) => (
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

              <p className="cart-unit">
                {formatPrice(item.unitPrice, lang)}
                {item.pricingType === "meter" && ` / ${t("meterUnit")}`}
              </p>

              <div className="cart-item-footer">
                <QuantityStepper
                  value={item.qty}
                  onChange={(value) => onSetQty(item.key, value)}
                />
                <strong>{formatPrice(item.unitPrice * item.qty, lang)}</strong>
                <button
                  className="remove-button"
                  type="button"
                  aria-label={t("remove")}
                  onClick={() => onRemove(item.key)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </article>
        ))}
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

import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  Navigation,
  Send,
  ShoppingBag
} from "lucide-react";

import { createOrder } from "../services/api";
import { formatPrice, localized } from "../utils/format";

const emptyErrors = {};

export default function CheckoutPage({
  t,
  lang,
  items,
  total,
  telegramUser,
  onBack,
  onClearCart,
  onContinue
}) {
  const [name, setName] = useState(
    [telegramUser?.first_name, telegramUser?.last_name]
      .filter(Boolean)
      .join(" ")
  );
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [coords, setCoords] = useState(null);
  const [locationError, setLocationError] = useState(false);
  const [errors, setErrors] = useState(emptyErrors);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [created, setCreated] = useState(null);

  if (created) {
    return (
      <main>
        <div className="success-card">
          <CheckCircle2 size={46} color="#4c7a45" />
          <h2>{t("successTitle")}</h2>
          <p className="success-number">{created.number}</p>
          <p>
            {t("successText", {
              number: created.number,
              phone
            })}
          </p>
          <p className="success-hint">{t("successHint")}</p>
          <button className="primary-button" type="button" onClick={onContinue}>
            {t("continueShopping")}
          </button>
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main>
        <BackBar t={t} onBack={onBack} />
        <div className="empty-state">
          <ShoppingBag size={30} />
          <p className="empty-title">{t("cartEmpty")}</p>
          <button className="primary-button" type="button" onClick={onContinue}>
            {t("goShopping")}
          </button>
        </div>
      </main>
    );
  }

  const requestLocation = () => {
    setLocationError(false);

    if (!navigator.geolocation) {
      setLocationError(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      () => setLocationError(true),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  const validate = () => {
    const next = {};

    if (name.trim().length < 2) next.name = t("nameError");
    if (phone.replace(/\D/g, "").length < 7) next.phone = t("phoneError");
    if (address.trim().length < 3) next.address = t("addressError");

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validate() || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const order = await createOrder({
        customer_name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        comment: comment.trim(),
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        telegram_id: telegramUser?.id ?? null,
        telegram_username: telegramUser?.username ?? null,
        items: items.map((item) => ({
          slug: item.slug,
          variant_id: item.variantId ?? null,
          color_id: item.colorId ?? null,
          width_cm: item.widthCm ?? null,
          height_cm: item.heightCm ?? null,
          quantity: item.qty
        }))
      });

      setCreated(order);
      onClearCart();
      window.scrollTo(0, 0);
    } catch (error) {
      setSubmitError(error.message || t("orderError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main>
      <BackBar t={t} onBack={onBack} />

      <div className="page-heading">
        <span className="eyebrow">UY TEXTILE</span>
        <h2>{t("checkoutTitle")}</h2>
        <p>{t("checkoutSubtitle")}</p>
      </div>

      <form className="checkout-form" onSubmit={handleSubmit} noValidate>
        <section className="form-card">
          <label className="form-field">
            <span>{t("yourName")}</span>
            <input
              type="text"
              value={name}
              autoComplete="name"
              placeholder={t("yourName")}
              onChange={(event) => setName(event.target.value)}
            />
            {errors.name && <em>{errors.name}</em>}
          </label>

          <label className="form-field">
            <span>{t("phoneLabel")}</span>
            <input
              type="tel"
              value={phone}
              autoComplete="tel"
              inputMode="tel"
              placeholder={t("phonePlaceholder")}
              onChange={(event) => setPhone(event.target.value)}
            />
            {errors.phone && <em>{errors.phone}</em>}
          </label>

          <label className="form-field">
            <span>{t("addressLabel")}</span>
            <input
              type="text"
              value={address}
              autoComplete="street-address"
              placeholder={t("addressPlaceholder")}
              onChange={(event) => setAddress(event.target.value)}
            />
            {errors.address && <em>{errors.address}</em>}
          </label>

          <label className="form-field">
            <span>{t("commentLabel")}</span>
            <textarea
              rows={2}
              value={comment}
              placeholder={t("commentPlaceholder")}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
        </section>

        <section className="form-card">
          <div className="form-card-head">
            <div>
              <h3>{t("locationLabel")}</h3>
              <p>{t("locationHint")}</p>
            </div>
            <MapPin size={19} color="#65715c" />
          </div>

          {coords ? (
            <div className="location-chip">
              <Navigation size={15} />
              <span>{t("locationAttached")}</span>
              <a
                href={`https://maps.google.com/?q=${coords.latitude},${coords.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                {t("openMap")}
              </a>
            </div>
          ) : (
            <button
              className="location-button"
              type="button"
              onClick={requestLocation}
            >
              <Navigation size={16} />
              {t("sendLocation")}
            </button>
          )}

          {locationError && <p className="form-error">{t("locationError")}</p>}
        </section>

        <section className="checkout-summary">
          {items.map((item) => (
            <div className="checkout-line" key={item.key}>
              <span>
                {item.qty} × {localized(item, "name", lang)}
                {item.variantLabel
                  ? ` · ${item.variantLabel.replace("см", t("cmShort"))}`
                  : ""}
              </span>
              <strong>{formatPrice(item.unitPrice * item.qty, lang)}</strong>
            </div>
          ))}

          <div className="summary-row">
            <span>{t("orderTotal")}</span>
            <strong>{formatPrice(total, lang)}</strong>
          </div>
          <p className="delivery-note">{t("checkoutNote")}</p>
        </section>

        {submitError && <p className="form-error">{submitError}</p>}

        <button className="add-button" type="submit" disabled={submitting}>
          <Send size={17} />
          {submitting ? t("placing") : t("placeOrder")}
        </button>
      </form>
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

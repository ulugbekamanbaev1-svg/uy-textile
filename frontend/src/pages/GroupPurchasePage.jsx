import { useEffect, useState } from "react";
import { Copy, Share2, Users, Clock3, Package } from "lucide-react";
import { createGroupPurchase, fetchGroupByInvite, fetchMyGroupPurchases, fetchProduct, fetchStoreSettings, joinGroupPurchase, leaveGroupPurchase, requestGroupPayment } from "../services/api";
import { formatPrice, localized } from "../utils/format";
import "./GroupPurchasePage.css";

export default function GroupPurchasePage({ t, lang, inviteToken, onOpenProduct }) {
  const createSlug = inviteToken && inviteToken.startsWith("create_") ? inviteToken.slice("create_".length) : null;
  const realInviteToken = inviteToken && !inviteToken.startsWith("create_") ? inviteToken : null;

  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joinMeters, setJoinMeters] = useState("1");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [deliveryDistrict, setDeliveryDistrict] = useState("");
  const [districts, setDistricts] = useState([]);
  const [busy, setBusy] = useState("");

  const [product, setProduct] = useState(null);
  const [createMeters, setCreateMeters] = useState("10");
  const [paymentMode, setPaymentMode] = useState("individual");
  const [variantId, setVariantId] = useState(null);
  const [colorId, setColorId] = useState(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      try {
        const s = await fetchStoreSettings();
        const raw = String(s?.delivery_districts || "").trim();
        if (raw) {
          try { const parsed = JSON.parse(raw); setDistricts(Array.isArray(parsed)?parsed.map(x=>String(x).trim()).filter(Boolean):[]); }
          catch { setDistricts(raw.split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean)); }
        } else setDistricts([]);
      } catch {}
      if (createSlug) {
        const p = await fetchProduct(createSlug);
        setProduct(p);
        setVariantId(p?.variants?.[0]?.id ?? null);
        setColorId(p?.colors?.[0]?.id ?? null);
        const my = await fetchMyGroupPurchases().catch(() => ({ items: [] }));
        setItems(my.items || []);
      } else if (realInviteToken) {
        const g = await fetchGroupByInvite(realInviteToken);
        setActive(g);
        const my = await fetchMyGroupPurchases().catch(() => ({ items: [] }));
        setItems(my.items || []);
      } else {
        const res = await fetchMyGroupPurchases();
        setItems(res.items || []);
        setActive((res.items || [])[0] || null);
      }
    } catch (e) { setError(e.message || "Error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [inviteToken]);

  const copyInvite = async (g) => {
    const url = g?.invite_url; if (!url) return;
    try { await navigator.clipboard.writeText(url); } catch {}
    window.Telegram?.WebApp?.showPopup?.({ title: "Farrux Birgalikda", message: t("gpCopied"), buttons: [{ type: "ok" }] });
  };
  const shareInvite = (g) => {
    const url = g?.invite_url; if (!url) return;
    const text = encodeURIComponent(t("gpShareText"));
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${text}`, "_blank");
  };

  const doCreate = async () => {
    if (!product) return;
    setBusy("create"); setError("");
    try {
      const g = await createGroupPurchase({
        product_slug: product.slug,
        variant_id: variantId,
        color_id: colorId,
        meters: Number(createMeters),
        payment_mode: paymentMode,
        delivery_district: deliveryDistrict,
      });
      setActive(g);
      setProduct(null);
      const my = await fetchMyGroupPurchases().catch(() => ({ items: [] }));
      setItems(my.items || []);
    } catch (e) { setError(e.message || "Error"); }
    finally { setBusy(""); }
  };

  const doJoin = async () => {
    if (!realInviteToken) return;
    setBusy("join"); setError("");
    try { await joinGroupPurchase({ token: realInviteToken, meters: Number(joinMeters), phone, address, delivery_district: deliveryDistrict }); await load(); }
    catch (e) { setError(e.message || "Error"); } finally { setBusy(""); }
  };
  const doLeave = async () => {
    if (!active) return; setBusy("leave");
    try { await leaveGroupPurchase(active.id); await load(); } catch (e) { setError(e.message || "Error"); } finally { setBusy(""); }
  };
  const doPay = async () => {
    if (!active) return; setBusy("pay");
    try { await requestGroupPayment(active.id, { phone, address, delivery_district: deliveryDistrict }); await load(); } catch (e) { setError(e.message || "Error"); } finally { setBusy(""); }
  };

  const g = active;
  const isMember = g && g.my_meters !== null && g.my_meters !== undefined;
  const canJoin = g && !isMember && ["open", "target_reached"].includes(g.status) && realInviteToken;

  return (
    <main className="gp-page">
      <section className="lux-card gp-hero">
        <div className="lux-section-head"><span className="lux-icon"><Users size={18} /></span><div><h1>{t("gpTitle")}</h1><p>{t("gpSubtitle")}</p></div></div>
      </section>

      {loading ? <div className="lux-card gp-state">{t("loading")}</div> : error ? <div className="lux-card gp-state error">{error}</div> : (
        <div className="gp-grid">
          <section className="lux-card gp-list">
            <h3>{t("gpMyGroups")}</h3>
            {items.length === 0 ? <p className="gp-muted">{t("gpEmpty")}</p> : items.map((it) => (
              <button key={it.id} type="button" className={`gp-list-item ${active?.id === it.id ? "active" : ""}`} onClick={() => { setActive(it); setProduct(null); }}>
                <div><strong>{localized(it, "product_name", lang) || it.product_slug}</strong><small>{Number(it.confirmed_meters).toFixed(2)} / {Number(it.minimum_meters).toFixed(2)} m</small></div>
                <span className="gp-badge">{t(`gpStatus_${it.status}`) || it.status}</span>
              </button>
            ))}
          </section>

          <section className="lux-card gp-detail">
            {product ? (
              <div className="gp-join">
                <h3>{t("gpCreate")}</h3>
                <p className="gp-muted">{localized(product, "name", lang)}</p>
                {product.variants?.length > 0 && <label>{t("sizeLabel")}<select value={variantId || ""} onChange={(e)=>setVariantId(Number(e.target.value))}>{product.variants.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label>}
                {product.colors?.length > 0 && <label>{t("colorLabel")}<select value={colorId || ""} onChange={(e)=>setColorId(Number(e.target.value))}>{product.colors.map(c=><option key={c.id} value={c.id}>{localized(c, "name", lang)}</option>)}</select></label>}
                <label>{t("gpMeters")}<input type="number" min="0.5" step="0.5" value={createMeters} onChange={(e)=>setCreateMeters(e.target.value)} /></label>
                <label>{t("gpPaymentMode")}
                  <select value={paymentMode} onChange={(e)=>setPaymentMode(e.target.value)}>
                    <option value="individual">{t("gpPayIndividual")}</option>
                    <option value="organizer">{t("gpPayOrganizer")}</option>
                  </select>
                </label>
                {districts.length > 0 && <label>{t("deliveryDistrict")}<select value={deliveryDistrict} onChange={(e)=>setDeliveryDistrict(e.target.value)}><option value="">{t("selectDistrict")}</option>{districts.map(d=><option key={d} value={d}>{d}</option>)}</select></label>}
                <button className="primary-button" type="button" disabled={busy==="create"} onClick={doCreate}>{t("gpCreate")}</button>
              </div>
            ) : !g ? <p className="gp-muted">{t("gpSelect")}</p> : (
              <>
                <div className="gp-product">
                  {g.product_image ? <img src={g.product_image} alt="" /> : <div className="gp-noimg"><Package size={24}/></div>}
                  <div>
                    <h2>{localized(g, "product_name", lang)}</h2>
                    <p>{g.variant_label}{g.color_name_uz ? ` • ${localized(g, "color_name", lang)}` : ""}</p>
                    <p>{t("gpWholesalePrice")}: <b>{formatPrice(g.unit_price || g.wholesale_price || 0)}</b> / m</p>
                    <p><Clock3 size={14}/> {g.expires_at ? new Date(g.expires_at).toLocaleString() : "—"}</p>
                  </div>
                </div>
                <div className="gp-progress">
                  <div className="gp-progress-bar"><span style={{ width: `${Math.min(100, (Number(g.confirmed_meters)/Number(g.minimum_meters||10))*100)}%` }} /></div>
                  <div className="gp-progress-meta"><span>{Number(g.confirmed_meters).toFixed(2)} / {Number(g.minimum_meters).toFixed(2)} m</span><span>{t("gpRemaining")}: {Number(g.remaining_meters).toFixed(2)} m</span></div>
                </div>
                <div className="gp-info-grid">
                  <div><span>{t("gpMyMeters")}</span><b>{g.my_meters != null ? `${Number(g.my_meters).toFixed(2)} m` : "—"}</b></div>
                  <div><span>{t("gpMyTotal")}</span><b>{g.my_total != null ? formatPrice(g.my_total) : "—"}</b></div>
                  <div><span>{t("gpStatus")}</span><b>{t(`gpStatus_${g.status}`) || g.status}</b></div>
                  <div><span>{t("gpPaymentMode")}</span><b>{g.payment_mode === "organizer" ? t("gpPayOrganizer") : t("gpPayIndividual")}</b></div>
                </div>
                <div className="gp-participants">
                  <h4>{t("gpParticipants")}</h4>
                  {(g.participants || []).map((p) => (
                    <div key={p.id} className="gp-participant"><span>{p.display_name}{p.is_organizer ? ` (${t("gpOrganizer")})` : ""}</span><b>{Number(p.meters).toFixed(2)} m</b></div>
                  ))}
                </div>
                {canJoin && (
                  <div className="gp-join">
                    <h4>{t("gpJoinTitle")}</h4>
                    <label>{t("gpMeters")}<input type="number" min="0.5" step="0.5" value={joinMeters} onChange={(e)=>setJoinMeters(e.target.value)} /></label>
                    <label>{t("phoneLabel")}<input value={phone} onChange={(e)=>setPhone(e.target.value)} /></label>
                    <label>{t("addressLabel")}<input value={address} onChange={(e)=>setAddress(e.target.value)} /></label>
                    {districts.length > 0 && <label>{t("deliveryDistrict")}<select value={deliveryDistrict} onChange={(e)=>setDeliveryDistrict(e.target.value)}><option value="">{t("selectDistrict")}</option>{districts.map(d=><option key={d} value={d}>{d}</option>)}</select></label>}
                    <button className="primary-button" type="button" disabled={busy==="join"} onClick={doJoin}>{t("gpJoinBtn")}</button>
                  </div>
                )}
                {isMember && g.status !== "cancelled" && g.status !== "expired" && (
                  <div className="gp-actions">
                    {g.invite_url && <button type="button" className="ghost-button" onClick={()=>copyInvite(g)}><Copy size={16}/> {t("gpCopyLink")}</button>}
                    {g.invite_url && <button type="button" className="ghost-button" onClick={()=>shareInvite(g)}><Share2 size={16}/> {t("gpShare")}</button>}
                    {Number(g.confirmed_meters) >= Number(g.minimum_meters) && g.my_payment_status !== "paid" && (g.payment_mode !== "organizer" || g.is_organizer) && (
                      <button type="button" className="primary-button" disabled={busy==="pay"} onClick={doPay}>{t("gpRequestPayment")}</button>
                    )}
                    {!g.is_organizer && g.my_payment_status !== "paid" && <button type="button" className="ghost-button danger" disabled={busy==="leave"} onClick={doLeave}>{t("gpLeave")}</button>}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
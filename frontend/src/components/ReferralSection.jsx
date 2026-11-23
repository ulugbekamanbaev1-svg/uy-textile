import { useEffect, useState } from "react";
import { Copy, Download, Gift, QrCode } from "lucide-react";
import { downloadReferralFile, fetchReferralMe } from "../services/api";
import { formatPrice } from "../utils/format";

export default function ReferralSection({ t, lang }) {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchReferralMe()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message || ""); });
    return () => { alive = false; };
  }, []);

  const copyLink = async () => {
    if (!data?.link) return;
    try {
      await navigator.clipboard.writeText(data.link);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = data.link; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (error) return null;
  if (!data) return (
    <section className="profile-section"><h3>{t("referralTitle")}</h3><p className="option-hint">{t("loading")}</p></section>
  );

  return (
    <section className="profile-section">
      <h3><Gift size={18} style={{verticalAlign:"middle", marginRight:8}} />{t("referralTitle")}</h3>

      <div className="contact-list" style={{ marginTop: 12 }}>
        <div className="contact-row" style={{alignItems:"flex-start"}}>
          <QrCode size={16} />
          <span>{t("referralMyLink")}</span>
          <strong style={{wordBreak:"break-all", fontSize:13}}>{data.link}</strong>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button type="button" className="primary-button" onClick={copyLink} style={{flex:1, minWidth:140}}>
          <Copy size={16} /> {copied ? t("referralCopied") : t("referralCopy")}
        </button>
        <button type="button" className="primary-button" onClick={() => downloadReferralFile("png").catch(()=>{})} style={{flex:1, minWidth:140}}>
          <Download size={16} /> PNG
        </button>
        <button type="button" className="primary-button" onClick={() => downloadReferralFile("pdf").catch(()=>{})} style={{flex:1, minWidth:140}}>
          <Download size={16} /> PDF
        </button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginTop:16 }}>
        <div className="profile-link-row" style={{flexDirection:"column", alignItems:"flex-start", gap:4}}>
          <span>{t("referralInvited")}</span><strong>{data.invited_count}</strong>
        </div>
        <div className="profile-link-row" style={{flexDirection:"column", alignItems:"flex-start", gap:4}}>
          <span>{t("referralSuccessful")}</span><strong>{data.successful_count}</strong>
        </div>
        <div className="profile-link-row" style={{flexDirection:"column", alignItems:"flex-start", gap:4}}>
          <span>{t("referralEarned")}</span><strong>{formatPrice(data.earned_total, lang)}</strong>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h4 style={{ marginBottom: 8 }}>{t("referralHistory")}</h4>
        {(data.rewards || []).length === 0 ? (
          <p className="option-hint">{t("referralNoRewards")}</p>
        ) : (
          <div className="contact-list">
            {data.rewards.map((r) => (
              <div className="profile-link-row" key={r.id}>
                <span>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ""} · {r.status}</span>
                <strong>{formatPrice(r.amount, lang)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
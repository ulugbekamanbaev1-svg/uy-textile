import { useEffect, useState } from "react";
import { Copy, Download, FileText, Gift, QrCode } from "lucide-react";

import { downloadReferralFile, fetchReferralMe } from "../services/api";
import { formatPrice } from "../utils/format";
import "./ReferralSection.css";

export default function ReferralSection({ t, lang }) {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let alive = true;

    fetchReferralMe()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setError(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  const copyLink = async () => {
    if (!data?.link) return;

    try {
      await navigator.clipboard.writeText(data.link);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = data.link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = async (kind) => {
    if (busy) return;

    setBusy(kind);
    try {
      await downloadReferralFile(kind);
    } catch {
      // Keep the existing silent download behaviour.
    } finally {
      setBusy("");
    }
  };

  if (error) return null;

  if (!data) {
    return (
      <section className="lux-card lux-referral">
        <div className="lux-section-head">
          <span className="lux-icon">
            <Gift size={18} />
          </span>
          <div>
            <h3>{t("referralTitle")}</h3>
            <p>{t("referralSubtitle")}</p>
          </div>
        </div>
        <p className="lux-loading">{t("loading")}</p>
      </section>
    );
  }

  return (
    <section className="lux-card lux-referral">
      <div className="lux-section-head">
        <span className="lux-icon">
          <Gift size={18} />
        </span>
        <div>
          <h3>{t("referralTitle")}</h3>
          <p>{t("referralSubtitle")}</p>
        </div>
      </div>

      <div className="ref-link-box">
        <span className="ref-link-icon">
          <QrCode size={17} />
        </span>
        <div className="ref-link-body">
          <span>{t("referralMyLink")}</span>
          <strong>{data.link}</strong>
        </div>
      </div>

      <div className="ref-actions">
        <button
          type="button"
          className="ref-btn ref-btn-primary"
          onClick={copyLink}
        >
          <Copy size={16} />
          {copied ? t("referralCopied") : t("referralCopy")}
        </button>

        <button
          type="button"
          className="ref-btn"
          onClick={() => download("png")}
          disabled={busy === "png"}
          aria-label={t("referralDownloadQr")}
        >
          <Download size={16} />
          PNG
        </button>

        <button
          type="button"
          className="ref-btn"
          onClick={() => download("pdf")}
          disabled={busy === "pdf"}
          aria-label={t("referralDownloadCard")}
        >
          <FileText size={16} />
          PDF
        </button>
      </div>

      <div className="ref-stats">
        <div className="ref-stat">
          <span>{t("referralInvited")}</span>
          <strong>{data.invited_count}</strong>
        </div>

        <div className="ref-stat">
          <span>{t("referralSuccessful")}</span>
          <strong>{data.successful_count}</strong>
        </div>

        <div className="ref-stat">
          <span>{t("referralEarned")}</span>
          <strong>{formatPrice(data.earned_total, lang)}</strong>
        </div>
      </div>

      <div className="ref-history">
        <h4>{t("referralHistory")}</h4>

        {(data.rewards || []).length === 0 ? (
          <p className="lux-empty">{t("referralNoRewards")}</p>
        ) : (
          <div className="ref-history-list">
            {data.rewards.map((reward) => (
              <div className="ref-history-row" key={reward.id}>
                <span>
                  {reward.created_at
                    ? new Date(reward.created_at).toLocaleDateString()
                    : ""}
                  {reward.status ? ` · ${reward.status}` : ""}
                </span>
                <strong>{formatPrice(reward.amount, lang)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

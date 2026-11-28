import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, Users, UserCheck, UserX, Clock3, Database, Bot } from "lucide-react";

import { adminFetch } from "../services/adminApi";
import "./TelegramUsersPanel.css";

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function StatCard({ icon: Icon, label, value, tone = "" }) {
  return (
    <div className={`tu-stat ${tone}`.trim()}>
      <div className="tu-stat-icon"><Icon size={18} /></div>
      <div className="tu-stat-body">
        <div className="tu-stat-value">{value ?? "—"}</div>
        <div className="tu-stat-label">{label}</div>
      </div>
    </div>
  );
}

export default function TelegramUsersPanel({ t }) {
  const [summary, setSummary] = useState(null);
  const [summaryState, setSummaryState] = useState("loading");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [activity, setActivity] = useState("");
  const [recovered, setRecovered] = useState("");
  const [listState, setListState] = useState("loading");
  const [selected, setSelected] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [candidatesState, setCandidatesState] = useState("idle");

  const limit = 25;

  const loadSummary = useCallback(async () => {
    setSummaryState("loading");
    try {
      const data = await adminFetch("/api/admin/telegram-users/summary");
      setSummary(data);
      setSummaryState("ready");
    } catch (e) {
      console.error(e);
      setSummaryState("error");
    }
  }, []);

  const loadList = useCallback(async () => {
    setListState("loading");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (q.trim()) params.set("q", q.trim());
      if (source) params.set("source", source);
      if (activity) params.set("activity", activity);
      if (recovered) params.set("recovered", recovered);
      const data = await adminFetch(`/api/admin/telegram-users?${params.toString()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setListState("ready");
    } catch (e) {
      console.error(e);
      setListState("error");
    }
  }, [page, q, source, activity, recovered]);

  const loadCandidates = useCallback(async () => {
    setCandidatesState("loading");
    try {
      const data = await adminFetch("/api/admin/telegram-users/recovery-candidates?page=1&limit=25");
      setCandidates(data);
      setCandidatesState("ready");
    } catch (e) {
      console.error(e);
      setCandidatesState("error");
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadList(); }, [loadList]);

  const openDetail = async (id) => {
    try {
      const data = await adminFetch(`/api/admin/telegram-users/${id}`);
      setSelected(data);
    } catch (e) {
      console.error(e);
    }
  };

  const pages = Math.max(1, Math.ceil(total / limit));
  const audit = summary?.recovery_audit;

  return (
    <div className="tu-panel">
      <div className="tu-head">
        <div>
          <h2>{t("telegramUsersTitle") || "Telegram Users"}</h2>
          <p className="admin-note">{t("telegramUsersSubtitle") || "Все известные пользователи Telegram, активность и аудит восстановления (read-only)."}</p>
        </div>
        <button type="button" className="ghost-admin-button" onClick={() => { loadSummary(); loadList(); }}>
          <RefreshCw size={15} /> {t("refresh") || "Обновить"}
        </button>
      </div>

      {summaryState === "loading" && <div className="admin-note">{t("loading") || "Загрузка..."}</div>}
      {summaryState === "error" && <div className="form-error">{t("errorLoading") || "Ошибка загрузки"}</div>}

      {summary && (
        <>
          <div className="tu-stats">
            <StatCard icon={Users} label={t("tuTotal") || "Всего известных"} value={summary.users_total} />
            <StatCard icon={UserCheck} label={t("tuNewToday") || "Новые сегодня"} value={summary.new_today} tone="green" />
            <StatCard icon={UserCheck} label={t("tuNewWeek") || "Новые за 7 дней"} value={summary.new_week} />
            <StatCard icon={Clock3} label={t("tuActive7d") || "Активны 7 дней"} value={summary.active_7d} tone="blue" />
            <StatCard icon={Clock3} label={t("tuActive30d") || "Активны 30 дней"} value={summary.active_30d} />
            <StatCard icon={UserX} label={t("tuInactive30d") || "Неактивны 30+ дней"} value={summary.inactive_30d} tone="muted" />
            <StatCard icon={Bot} label={t("tuBotStart") || "Через /start"} value={summary.bot_start_users} />
            <StatCard icon={UserCheck} label={t("tuMiniApp") || "Открывали Mini App"} value={summary.miniapp_users} />
            <StatCard icon={Database} label={t("tuRecovered") || "Восстановленные"} value={summary.recovered_users} />
          </div>

          <div className="tu-audit admin-card">
            <div className="tu-audit-head">
              <div>
                <h3>{t("tuRecoveryAudit") || "Аудит восстановления (read-only)"}</h3>
                <p className="admin-note">{audit?.unrecoverable_note}</p>
              </div>
              <button type="button" className="ghost-admin-button" onClick={loadCandidates}>
                {t("tuShowCandidates") || "Показать кандидатов"}
              </button>
            </div>
            <div className="tu-audit-grid">
              <div><span>{t("tuOrdersDistinct") || "Distinct Telegram ID в заказах"}</span><strong>{audit?.orders_distinct_telegram_id}</strong></div>
              <div><span>{t("tuMissingOrders") || "Нет в users (из заказов)"}</span><strong>{audit?.missing_from_orders}</strong></div>
              <div><span>{t("tuCartDistinct") || "Distinct Telegram ID в корзинах"}</span><strong>{audit?.cart_distinct_telegram_id}</strong></div>
              <div><span>{t("tuMissingCart") || "Нет в users (из корзин)"}</span><strong>{audit?.missing_from_cart}</strong></div>
              <div><span>{t("tuRecoverable") || "Можно восстановить сейчас"}</span><strong>{audit?.recoverable_now}</strong></div>
              <div><span>{t("tuAfterRecovery") || "Будет известно после backfill"}</span><strong>{audit?.known_after_recovery_estimate}</strong></div>
            </div>
            <div className="admin-note tu-audit-note">
              {t("tuAuditDisclaimer") || "Данные в БД не изменялись. Точная дата /start для исторических кандидатов неизвестна. Telegram Bot API не возвращает исторический список всех пользователей."}
            </div>

            {candidatesState === "loading" && <div className="admin-note">{t("loading") || "Загрузка..."}</div>}
            {candidates && candidatesState === "ready" && (
              <div className="tu-candidates">
                <h4>{t("tuCandidates") || "Кандидаты на восстановление"} ({candidates.total})</h4>
                <div className="tu-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Telegram ID</th>
                        <th>{t("name") || "Имя"}</th>
                        <th>Username</th>
                        <th>{t("tuOrders") || "Заказы"}</th>
                        <th>{t("tuFirstOrder") || "Первый заказ"}</th>
                        <th>{t("tuLastOrder") || "Последний заказ"}</th>
                        <th>{t("tuStartKnown") || "/start известен"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.items.map((c) => (
                        <tr key={c.telegram_id}>
                          <td>{c.telegram_id}</td>
                          <td>{c.customer_name || "—"}</td>
                          <td>{c.telegram_username ? `@${c.telegram_username}` : "—"}</td>
                          <td>{c.orders_count}</td>
                          <td>{fmtDate(c.first_order_at)}</td>
                          <td>{fmtDate(c.last_order_at)}</td>
                          <td>{t("tuUnknown") || "Неизвестно"}</td>
                        </tr>
                      ))}
                      {!candidates.items.length && (
                        <tr><td colSpan="7" className="admin-note">{t("tuNoCandidates") || "Кандидатов не найдено"}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="admin-card tu-list-card">
        <div className="tu-filters">
          <label className="tu-search">
            <Search size={15} />
            <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder={t("tuSearch") || "Поиск: Telegram ID, имя, username"} />
          </label>
          <select value={source} onChange={(e) => { setPage(1); setSource(e.target.value); }}>
            <option value="">{t("tuAllSources") || "Все источники"}</option>
            <option value="bot_start">bot_start</option>
            <option value="mini_app">mini_app</option>
            <option value="recovered_orders">recovered_orders</option>
            <option value="recovered_cart">recovered_cart</option>
            <option value="unknown">unknown</option>
          </select>
          <select value={activity} onChange={(e) => { setPage(1); setActivity(e.target.value); }}>
            <option value="">{t("tuAllActivity") || "Вся активность"}</option>
            <option value="active_7d">{t("tuActive7d") || "Активны 7 дней"}</option>
            <option value="active_30d">{t("tuActive30d") || "Активны 30 дней"}</option>
            <option value="inactive_30d">{t("tuInactive30d") || "Неактивны 30+ дней"}</option>
            <option value="miniapp">{t("tuMiniApp") || "Открывали Mini App"}</option>
            <option value="bot_start">{t("tuBotStart") || "Через /start"}</option>
          </select>
          <select value={recovered} onChange={(e) => { setPage(1); setRecovered(e.target.value); }}>
            <option value="">{t("tuAllRecovered") || "Все"}</option>
            <option value="yes">{t("tuRecoveredOnly") || "Только восстановленные"}</option>
            <option value="no">{t("tuNotRecovered") || "Не восстановленные"}</option>
          </select>
        </div>

        {listState === "loading" && <div className="admin-note">{t("loading") || "Загрузка..."}</div>}
        {listState === "error" && <div className="form-error">{t("errorLoading") || "Ошибка загрузки"}</div>}

        <div className="tu-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Telegram ID</th>
                <th>{t("name") || "Имя"}</th>
                <th>Username</th>
                <th>{t("tuSource") || "Источник"}</th>
                <th>{t("tuFirstSeen") || "Первый известный"}</th>
                <th>{t("tuLastSeen") || "Последняя активность"}</th>
                <th>{t("tuMiniAppAt") || "Mini App"}</th>
                <th>{t("tuBotStartAt") || "/start"}</th>
                <th>{t("tuStatus") || "Статус"}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="tu-row" onClick={() => openDetail(u.id)}>
                  <td>{u.telegram_id}</td>
                  <td>{u.name}</td>
                  <td>{u.username ? `@${u.username}` : "—"}</td>
                  <td><span className={`tu-badge ${u.is_recovered ? "recovered" : ""}`}>{u.registration_source}</span></td>
                  <td>{fmtDate(u.created_at)}</td>
                  <td>{fmtDate(u.last_seen_at)}</td>
                  <td>{fmtDate(u.first_mini_app_at)}</td>
                  <td>{u.bot_started_at ? fmtDate(u.bot_started_at) : <span className="tu-muted">{t("tuUnknown") || "Неизвестно"}</span>}</td>
                  <td>
                    <span className={`tu-badge ${u.active_30d ? "active" : "inactive"}`}>
                      {u.active_30d ? (t("tuActive") || "Активен") : (t("tuInactive") || "Неактивен")}
                    </span>
                  </td>
                </tr>
              ))}
              {!items.length && listState === "ready" && (
                <tr><td colSpan="9" className="admin-note">{t("nothingFound") || "Ничего не найдено"}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="tu-pager">
          <button type="button" className="ghost-admin-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("prev") || "Назад"}</button>
          <span>{page} / {pages} · {total}</span>
          <button type="button" className="ghost-admin-button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t("next") || "Далее"}</button>
        </div>
      </div>

      {selected && (
        <div className="tu-modal" onClick={() => setSelected(null)}>
          <div className="tu-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
            <div className="tu-modal-head">
              <h3>{selected.name} <span className="tu-muted">#{selected.telegram_id}</span></h3>
              <button type="button" className="ghost-admin-button" onClick={() => setSelected(null)}>{t("close") || "Закрыть"}</button>
            </div>
            <div className="tu-detail-grid">
              <div><span>Telegram ID</span><strong>{selected.telegram_id}</strong></div>
              <div><span>Username</span><strong>{selected.username ? `@${selected.username}` : "—"}</strong></div>
              <div><span>{t("tuSource") || "Источник"}</span><strong>{selected.registration_source}</strong></div>
              <div><span>{t("tuRecoveredFlag") || "Восстановлен"}</span><strong>{selected.is_recovered ? (t("yes") || "Да") : (t("no") || "Нет")}</strong></div>
              <div><span>{t("tuCreated") || "Запись в БД создана"}</span><strong>{fmtDate(selected.created_at)}</strong></div>
              <div><span>{t("tuBotStartAt") || "Дата /start"}</span><strong>{selected.bot_started_at ? fmtDate(selected.bot_started_at) : (t("tuUnknown") || "Неизвестно")}</strong></div>
              <div><span>{t("tuFirstMiniApp") || "Первый Mini App"}</span><strong>{selected.first_mini_app_at ? fmtDate(selected.first_mini_app_at) : "—"}</strong></div>
              <div><span>{t("tuLastMiniApp") || "Последний Mini App"}</span><strong>{selected.last_mini_app_at ? fmtDate(selected.last_mini_app_at) : "—"}</strong></div>
              <div><span>{t("tuLastSeen") || "Последняя активность"}</span><strong>{fmtDate(selected.last_seen_at)}</strong></div>
              <div><span>{t("tuMiniAppVisits") || "Визиты Mini App"}</span><strong>{selected.mini_app_visits_count}</strong></div>
              <div><span>{t("tuBotStarts") || "Нажатий /start"}</span><strong>{selected.bot_starts_count}</strong></div>
              <div><span>{t("tuOrders") || "Заказы"}</span><strong>{selected.orders_count}</strong></div>
              <div><span>{t("tuFirstOrder") || "Первый заказ"}</span><strong>{fmtDate(selected.first_order_at)}</strong></div>
              <div><span>{t("tuLastOrder") || "Последний заказ"}</span><strong>{fmtDate(selected.last_order_at)}</strong></div>
            </div>
            {selected.recovery_note && <p className="admin-note">{selected.recovery_note}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

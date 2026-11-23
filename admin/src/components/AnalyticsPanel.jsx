import { useState } from "react";
import {
  Boxes,
  PiggyBank,
  Plus,
  Receipt,
  ShoppingBag,
  Trash2,
  TrendingUp,
  Truck,
  Users,
  Wallet
} from "lucide-react";

import { adminDownload, adminFetch } from "../services/adminApi";
import { formatPrice, localized } from "../utils/format";

const STATUS_KEYS = {
  new: "statusNew",
  confirmed: "statusConfirmed",
  delivering: "statusDelivering",
  done: "statusDone",
  cancelled: "statusCancelled"
};

const PERIODS = [7, 30, 90];

const EXPENSE_CATEGORIES = ["delivery", "packaging", "ads", "rent", "other"];

const EXPENSE_LABELS = {
  delivery: "expenseCatDelivery",
  packaging: "expenseCatPackaging",
  ads: "expenseCatAds",
  rent: "expenseCatRent",
  other: "expenseCatOther"
};

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatQuantity(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function formatDate(value, lang) {
  if (!value) return "";

  try {
    return new Date(value).toLocaleDateString(
      lang === "uz" ? "uz-UZ" : lang === "uzc" ? "uz-Cyrl" : "ru-RU"
    );
  } catch {
    return String(value).slice(0, 10);
  }
}

function emptyExpense() {
  return {
    title: "",
    category: "delivery",
    amount: "",
    spent_at: todayISO()
  };
}

export default function AnalyticsPanel({
  analytics,
  days,
  onDaysChange,
  onRefresh,
  t,
  lang
}) {
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState("");

  if (!analytics) {
    return <p className="admin-note">{t("loading")}</p>;
  }

  const maxRevenue = Math.max(
    ...analytics.daily.map((point) => point.revenue),
    1
  );
  const labelStep = Math.ceil(analytics.daily.length / 10);

  const money = (value) => formatPrice(value, lang);
  const profitClass = (value) => (Number(value) < 0 ? "negative" : "positive");

  const salesKpis = [
    ["analyticsRevenue", money(analytics.revenue), Wallet],
    ["analyticsOrders", analytics.orders, ShoppingBag],
    ["analyticsAverage", money(analytics.average_order), TrendingUp],
    ["analyticsClients", analytics.clients, Users]
  ];

  const profitKpis = [
    ["analyticsCost", money(analytics.cost), Boxes],
    ["analyticsGrossProfit", money(analytics.gross_profit), TrendingUp],
    ["analyticsExpenses", money(analytics.expenses), Truck],
    ["analyticsNetProfit", money(analytics.net_profit), PiggyBank]
  ];

  const updateExpense = (field, value) => {
    setExpenseForm((current) => ({ ...current, [field]: value }));
    setExpenseError("");
  };

  const submitExpense = async (event) => {
    event.preventDefault();

    if (expenseSaving) return;

    const amount = Math.round(
      Number(String(expenseForm.amount).replace(",", "."))
    );

    if (!expenseForm.title.trim() || !Number.isFinite(amount) || amount <= 0) {
      setExpenseError(t("expenseError"));
      return;
    }

    setExpenseSaving(true);
    setExpenseError("");

    try {
      await adminFetch("/api/admin/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: expenseForm.title.trim(),
          category: expenseForm.category,
          amount,
          spent_at: expenseForm.spent_at
            ? `${expenseForm.spent_at}T12:00:00`
            : null
        })
      });

      setExpenseForm(emptyExpense());

      if (onRefresh) await onRefresh();
    } catch (error) {
      setExpenseError(error.message || t("formError"));
    } finally {
      setExpenseSaving(false);
    }
  };

  const removeExpense = async (expense) => {
    if (!window.confirm(t("expenseDeleteConfirm", { name: expense.title }))) {
      return;
    }

    try {
      await adminFetch(`/api/admin/expenses/${expense.id}`, {
        method: "DELETE"
      });

      if (onRefresh) await onRefresh();
    } catch (error) {
      setExpenseError(error.message || t("formError"));
    }
  };

  return (
    <>
      <div className="analytics-toolbar">
        <div className="order-filters">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              className={days === period ? "active" : ""}
              onClick={() => onDaysChange(period)}
            >
              {t(`period${period}`)}
            </button>
          ))}
        </div>
        <div className="analytics-export">
          <span className="admin-note">{t("reportExport")}</span>
          <div className="export-buttons">
            {["day", "week", "month"].map((period) => (
              <div className="export-group" key={period}>
                <span>{t(`report${period[0].toUpperCase()}${period.slice(1)}`)}</span>
                <button
                  type="button"
                  className="small-button"
                  onClick={() =>
                    adminDownload(
                      `/api/admin/reports/export?period=${period}&format=xlsx&lang=${lang}`,
                      `report-${period}.xlsx`
                    )
                  }
                >
                  Excel
                </button>
                <button
                  type="button"
                  className="small-button"
                  onClick={() =>
                    adminDownload(
                      `/api/admin/reports/export?period=${period}&format=pdf&lang=${lang}`,
                      `report-${period}.pdf`
                    )
                  }
                >
                  PDF
                </button>
                <button
                  type="button"
                  className="small-button"
                  onClick={() =>
                    adminDownload(
                      `/api/admin/reports/export?period=${period}&format=csv&lang=${lang}`,
                      `report-${period}.csv`
                    )
                  }
                >
                  CSV
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="stats analytics-stats">
        {salesKpis.map(([key, value, Icon]) => (
          <div className="stat-card" key={key}>
            <Icon size={22} />
            <p>{t(key)}</p>
            <h2>{value}</h2>
          </div>
        ))}
      </section>

      <section className="stats analytics-stats analytics-profit-stats">
        {profitKpis.map(([key, value, Icon]) => (
          <div
            className={`stat-card${
              key === "analyticsNetProfit" ? ` profit-${profitClass(analytics.net_profit)}` : ""
            }`}
            key={key}
          >
            <Icon size={22} />
            <p>{t(key)}</p>
            <h2>{value}</h2>
          </div>
        ))}
      </section>

      <div className="analytics-grid">
        <section className="products-card analytics-card">
          <div className="products-card-head">
            <h3>{t("analyticsDailyTitle")}</h3>
            <span className="table-count">
              {t("analyticsOrders")}: {analytics.orders}
            </span>
          </div>

          {analytics.orders === 0 ? (
            <p className="admin-note">{t("analyticsNoSales")}</p>
          ) : (
            <div className="sales-chart">
              {analytics.daily.map((point, index) => (
                <div
                  className="chart-column"
                  key={point.day}
                  title={`${point.day}: ${money(point.revenue)}`}
                >
                  <div className="chart-bar-wrap">
                    <div
                      className={`chart-bar${
                        point.orders ? " has-sales" : ""
                      }`}
                      style={{
                        height: `${Math.max(
                          point.revenue ? 4 : 1,
                          Math.round((point.revenue / maxRevenue) * 100)
                        )}%`
                      }}
                    />
                  </div>
                  <span>
                    {index % labelStep === 0 || index === analytics.daily.length - 1
                      ? point.day.slice(8)
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="products-card analytics-card">
          <div className="products-card-head">
            <h3>{t("analyticsTopTitle")}</h3>
          </div>

          {analytics.top_products.length === 0 ? (
            <p className="admin-note">{t("analyticsNoSales")}</p>
          ) : (
            <div className="top-products">
              {analytics.top_products.map((product, index) => (
                <div className="top-product" key={`${product.name_ru}-${index}`}>
                  <span className="top-rank">{index + 1}</span>
                  <div className="top-product-info">
                    <strong>{localized(product, "name", lang)}</strong>
                    <span>
                      {t("analyticsQuantity")}: {product.quantity}
                    </span>
                  </div>
                  <strong className="top-product-revenue">
                    {money(product.revenue)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="products-card analytics-card">
          <div className="products-card-head">
            <h3>{t("analyticsStatusTitle")}</h3>
          </div>

          <div className="status-summary">
            {analytics.statuses.map((status) => (
              <div className="status-summary-row" key={status.status}>
                <span className={`status-dot ${status.status}`} />
                <span>{t(STATUS_KEYS[status.status] || "orderStatus")}</span>
                <strong>{status.count}</strong>
              </div>
            ))}
          </div>

          <p className="admin-note">
            {t("statusDone")}: {analytics.delivered} · {t("statusCancelled")}:{" "}
            {analytics.cancelled}
          </p>
        </section>
      </div>

      <section className="products-card analytics-card analytics-wide-card">
        <div className="products-card-head">
          <div>
            <h3>{t("analyticsProfitTitle")}</h3>
            <p className="admin-note">{t("analyticsProfitHint")}</p>
          </div>
          <span className="table-count">
            {t("analyticsGrossProfit")}: {money(analytics.gross_profit)}
          </span>
        </div>

        {analytics.product_profits.length === 0 ? (
          <p className="admin-note">{t("analyticsNoSales")}</p>
        ) : (
          <div className="table-scroll">
            <table className="profit-table">
              <thead>
                <tr>
                  <th>{t("colProduct")}</th>
                  <th>{t("colSold")}</th>
                  <th>{t("colRevenue")}</th>
                  <th>{t("colPurchasePrice")}</th>
                  <th>{t("colCost")}</th>
                  <th>{t("colGrossProfit")}</th>
                </tr>
              </thead>
              <tbody>
                {analytics.product_profits.map((product, index) => (
                  <tr key={`${product.name_ru}-${index}`}>
                    <td>{localized(product, "name", lang)}</td>
                    <td>{formatQuantity(product.quantity)}</td>
                    <td>{money(product.revenue)}</td>
                    <td>{money(product.unit_cost)}</td>
                    <td>{money(product.cost)}</td>
                    <td className={`profit-value ${profitClass(product.profit)}`}>
                      {money(product.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="products-card analytics-card analytics-wide-card">
        <div className="products-card-head">
          <div>
            <h3>{t("expensesTitle")}</h3>
            <p className="admin-note">{t("expensesHint")}</p>
          </div>
          <span className="table-count">
            {t("analyticsExpenses")}: {money(analytics.expenses)}
          </span>
        </div>

        <div className="expense-categories">
          {analytics.expense_categories.map((entry) => (
            <div className="expense-category" key={entry.category}>
              <span>{t(EXPENSE_LABELS[entry.category] || "expenseCatOther")}</span>
              <strong>{money(entry.amount)}</strong>
            </div>
          ))}
        </div>

        <form className="expense-form" onSubmit={submitExpense}>
          <div className="expense-form-grid">
            <label className="admin-field">
              <span>{t("expenseName")}</span>
              <input
                type="text"
                value={expenseForm.title}
                placeholder={t("expenseNamePlaceholder")}
                onChange={(event) => updateExpense("title", event.target.value)}
                required
              />
            </label>

            <label className="admin-field">
              <span>{t("expenseCategory")}</span>
              <select
                value={expenseForm.category}
                onChange={(event) =>
                  updateExpense("category", event.target.value)
                }
              >
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(EXPENSE_LABELS[category])}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>{t("expenseAmount")}</span>
              <input
                type="number"
                min="1"
                step="1000"
                value={expenseForm.amount}
                onChange={(event) => updateExpense("amount", event.target.value)}
                required
              />
            </label>

            <label className="admin-field">
              <span>{t("expenseDate")}</span>
              <input
                type="date"
                value={expenseForm.spent_at}
                onChange={(event) =>
                  updateExpense("spent_at", event.target.value)
                }
              />
            </label>
          </div>

          {expenseError && <p className="form-error">{expenseError}</p>}

          <button
            type="submit"
            className="primary-admin-button"
            disabled={expenseSaving}
          >
            <Plus size={15} />
            {expenseSaving ? t("saving") : t("expenseAdd")}
          </button>
        </form>

        <div className="section-head expense-history-head">
          <h4>{t("expenseHistoryTitle")}</h4>
          <span className="table-count">
            {analytics.expense_history.length}
          </span>
        </div>

        {analytics.expense_history.length === 0 ? (
          <p className="admin-note">{t("expenseEmpty")}</p>
        ) : (
          <div className="table-scroll">
            <table className="expense-table">
              <thead>
                <tr>
                  <th>{t("expenseName")}</th>
                  <th>{t("expenseCategory")}</th>
                  <th>{t("expenseDate")}</th>
                  <th>{t("expenseAmount")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {analytics.expense_history.map((expense) => (
                  <tr key={expense.id}>
                    <td>
                      <span className="expense-name">
                        <Receipt size={14} />
                        {expense.title}
                      </span>
                    </td>
                    <td>
                      {t(EXPENSE_LABELS[expense.category] || "expenseCatOther")}
                    </td>
                    <td>{formatDate(expense.spent_at, lang)}</td>
                    <td className="profit-value negative">
                      −{money(expense.amount)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-button danger"
                        title={t("remove")}
                        aria-label={t("remove")}
                        onClick={() => removeExpense(expense)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

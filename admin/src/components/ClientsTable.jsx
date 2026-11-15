import { Phone, Search } from "lucide-react";

import { formatPrice } from "../utils/format";

function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

export default function ClientsTable({
  clients,
  t,
  lang,
  search,
  onSearchChange
}) {
  const locale =
    lang === "uzc" ? "uz-Cyrl-UZ" : lang === "uz" ? "uz-UZ" : "ru-RU";

  const query = search.trim().toLowerCase();
  const visible = query
    ? clients.filter((client) =>
        [client.name, client.phone, client.telegram_username].some((value) =>
          (value || "").toLowerCase().includes(query)
        )
      )
    : clients;

  return (
    <>
      <div className="table-toolbar">
        <div className="admin-search">
          <Search size={17} />
          <input
            type="search"
            value={search}
            placeholder={t("clientSearch")}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <span className="table-count">
          {t("clientsCount", { count: visible.length })}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="admin-placeholder">
          <h2>{t("clientsEmpty")}</h2>
          <p>{t("clientsEmptyHint")}</p>
        </div>
      ) : (
        <section className="products-card clients-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("colClient")}</th>
                  <th>{t("colClientPhone")}</th>
                  <th>{t("colClientOrders")}</th>
                  <th>{t("colClientSpent")}</th>
                  <th>{t("colClientLast")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((client, index) => {
                  const lastOrder = client.last_order_at
                    ? new Date(client.last_order_at).toLocaleDateString(locale, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric"
                      })
                    : "—";

                  return (
                    <tr key={`${client.phone}-${client.name}-${index}`}>
                      <td>
                        <div className="client-cell">
                          <div className="client-avatar">{initial(client.name)}</div>
                          <div>
                            <strong>{client.name || t("clientGuest")}</strong>
                            {client.telegram_username && (
                              <span className="client-tag">
                                @{client.telegram_username}
                              </span>
                            )}
                            {client.address && (
                              <span className="client-address">
                                {client.address}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {client.phone ? (
                          <a className="phone-link" href={`tel:${client.phone}`}>
                            <Phone size={13} />
                            {client.phone}
                          </a>
                        ) : (
                          <span className="muted">{t("clientNoPhone")}</span>
                        )}
                      </td>
                      <td>{client.orders_count}</td>
                      <td className="price-cell">
                        {formatPrice(client.total_spent, lang)}
                      </td>
                      <td>{lastOrder}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

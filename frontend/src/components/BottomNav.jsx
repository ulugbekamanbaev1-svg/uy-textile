import { House, LayoutGrid, Heart, PackageSearch, UserRound } from "lucide-react";

const TABS = [
  ["home", House, "navHome"],
  ["catalog", LayoutGrid, "navCatalog"],
  ["favorites", Heart, "navFavorites"],
  ["orders", PackageSearch, "navOrders"],
  ["profile", UserRound, "navProfile"]
];

export default function BottomNav({ t, page, onNavigate }) {
  return (
    <nav className="bottom-nav">
      {TABS.map(([key, Icon, label]) => (
        <button
          key={key}
          type="button"
          className={page === key ? "active" : ""}
          onClick={() => onNavigate(key)}
        >
          <Icon size={20} />
          <span>{t(label)}</span>
        </button>
      ))}
    </nav>
  );
}

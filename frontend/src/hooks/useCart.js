import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { syncCart } from "../services/api";
import visitorTracker from "../services/visitorTracker";
import { itemLineTotal } from "../utils/pricing";

const STORAGE_KEY = "uy_cart";

function readCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useCart() {
  const [items, setItems] = useState(readCart);

  const syncTimer = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // localStorage может быть недоступен
    }

    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      const totalValue = items.reduce((sum, entry) => sum + itemLineTotal(entry), 0);
      const payload = items.map((item) => ({
        name: item.name_ru || item.name_uz || item.name_uzc || item.slug || "Товар",
        qty_label:
          item.pricingType === "meter"
            ? `${item.meters || 0} m`
            : item.widthCm && item.heightCm
              ? `${item.qty || 1} x (${item.widthCm}x${item.heightCm})`
              : String(item.qty || 1),
        line_total: Math.round(itemLineTotal(item) || 0)
      }));
      syncCart(payload, totalValue);
    }, 800);

    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [items]);

  const add = useCallback((item, qty = 1) => {
    setItems((current) => {
      const existing = current.find((entry) => entry.key === item.key);

      if (existing) {
        return current.map((entry) => {
          if (entry.key !== item.key) {
            return entry;
          }

          if (item.pricingType === "meter") {
            return {
              ...entry,
              ...item,
              meters: Number(entry.meters || 0) + Number(item.meters || 0),
              qty: 1
            };
          }

          return { ...entry, ...item, qty: entry.qty + qty };
        });
      }

      return [...current, { ...item, qty }];
    });

    visitorTracker.trackAddToCart(item, qty);
  }, []);

  const setQty = useCallback((key, qty) => {
    setItems((current) =>
      qty <= 0
        ? current.filter((entry) => entry.key !== key)
        : current.map((entry) =>
            entry.key === key ? { ...entry, qty } : entry
          )
    );
  }, []);

  const setMeters = useCallback((key, meters) => {
    setItems((current) =>
      !Number(meters) || Number(meters) <= 0
        ? current.filter((entry) => entry.key !== key)
        : current.map((entry) =>
            entry.key === key
              ? { ...entry, meters: Number(meters), qty: 1 }
              : entry
          )
    );
  }, []);

  const remove = useCallback((key) => {
    const entry = items.find((item) => item.key === key);
    if (entry) visitorTracker.trackRemoveFromCart(entry);
    setItems((current) => current.filter((item) => item.key !== key));
  }, [items]);

  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(
    () =>
      items.reduce(
        (sum, entry) =>
          sum + (entry.pricingType === "meter" ? 1 : entry.qty || 0),
        0
      ),
    [items]
  );

  const total = useMemo(
    () => items.reduce((sum, entry) => sum + itemLineTotal(entry), 0),
    [items]
  );

  return { items, add, setQty, setMeters, remove, clear, count, total };
}

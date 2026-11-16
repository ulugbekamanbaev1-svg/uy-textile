import { useCallback, useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // localStorage может быть недоступен
    }
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
    setItems((current) => current.filter((entry) => entry.key !== key));
  }, []);

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

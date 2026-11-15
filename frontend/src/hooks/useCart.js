import { useCallback, useEffect, useMemo, useState } from "react";

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
        return current.map((entry) =>
          entry.key === item.key
            ? { ...entry, qty: entry.qty + qty }
            : entry
        );
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

  const remove = useCallback((key) => {
    setItems((current) => current.filter((entry) => entry.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(
    () => items.reduce((sum, entry) => sum + entry.qty, 0),
    [items]
  );

  const total = useMemo(
    () => items.reduce((sum, entry) => sum + entry.unitPrice * entry.qty, 0),
    [items]
  );

  return { items, add, setQty, remove, clear, count, total };
}

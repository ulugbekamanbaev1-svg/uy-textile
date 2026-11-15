import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "uy_favorites";

function readFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useFavorites() {
  const [items, setItems] = useState(readFavorites);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // localStorage может быть недоступен
    }
  }, [items]);

  const toggle = useCallback((product) => {
    setItems((current) => {
      const exists = current.some((entry) => entry.slug === product.slug);

      if (exists) {
        return current.filter((entry) => entry.slug !== product.slug);
      }

      return [...current, product];
    });
  }, []);

  const isFavorite = useCallback(
    (slug) => items.some((entry) => entry.slug === slug),
    [items]
  );

  return { items, toggle, isFavorite };
}

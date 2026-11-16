"""Расчёт цен с учётом оптовых тарифов.

Оптовый тариф действует от `min_quantity` в единицах товара:
- piece  — штуки;
- meter  — метры;
- area   — квадратные метры.

Если подходящих тарифов несколько, берётся тариф с самым большим
`min_quantity` (самая выгодная цена). `max_quantity` используется только
для подписи диапазона в интерфейсе.
"""

from __future__ import annotations

from typing import Iterable, Protocol


class TierLike(Protocol):
    min_quantity: float
    price: int


def _min_quantity(tier: TierLike) -> float:
    return float(tier.min_quantity)


def pick_price_tier(
    tiers: Iterable[TierLike], amount: float
) -> TierLike | None:
    eligible = [
        tier for tier in tiers if float(amount) + 1e-9 >= _min_quantity(tier)
    ]

    if not eligible:
        return None

    return max(eligible, key=_min_quantity)


def effective_unit_price(
    tiers: Iterable[TierLike], amount: float, base_price: int
) -> int:
    tier = pick_price_tier(tiers, amount)

    return int(tier.price) if tier is not None else int(base_price)


def round_money(value: float) -> int:
    return int(round(float(value)))


def normalize_meters(value: float) -> float:
    """Метраж храним с точностью до сантиметра."""
    return round(float(value), 2)

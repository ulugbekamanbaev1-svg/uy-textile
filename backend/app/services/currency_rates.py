import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.currency import CurrencyModuleState, CurrencyRateCache

logger = logging.getLogger(__name__)

TZ_TASHKENT = timezone(timedelta(hours=5))
SUPPORTED_CURRENCIES = ["USD", "EUR", "RUB", "KZT", "CNY", "GBP", "TRY", "CHF"]
SUPPORTED_SOURCE_TYPES = ["bank"]
BASE_CURRENCY = "UZS"
PROVIDER_NAME = "Wasyt (bank.uz)"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _to_tashkent_iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TZ_TASHKENT).isoformat()


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            # Python 3.11+ fromisoformat handles +05:00; also handle Z
            v = value.replace("Z", "+00:00")
            dt = datetime.fromisoformat(v)
            return dt if dt.tzinfo else dt.replace(tzinfo=TZ_TASHKENT)
        except Exception:
            return None
    return None


def _clean_rate(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        num = float(value)
    except Exception:
        return None
    if num <= 0:
        return None
    return num


def normalize_bank(raw: dict, source_updated_at: str | None) -> dict:
    buy = _clean_rate(raw.get("buy"))
    sell = _clean_rate(raw.get("sell"))
    name = str(raw.get("name") or "").strip()
    slug = str(raw.get("slug") or "").strip()
    if not slug and name:
        slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in name).strip("-")
    return {
        "name": name,
        "slug": slug,
        "logo_url": None,
        "buy": buy,
        "sell": sell,
        "source_type": "bank",
        "updated_at": source_updated_at,
    }


def compute_best(banks: list[dict]) -> tuple[dict | None, dict | None]:
    best_buy = None
    best_sell = None
    for b in banks:
        buy = b.get("buy")
        sell = b.get("sell")
        if isinstance(buy, (int, float)):
            if best_buy is None or buy > best_buy["rate"]:
                best_buy = {"bank": b.get("name"), "slug": b.get("slug"), "rate": float(buy)}
        if isinstance(sell, (int, float)):
            if best_sell is None or sell < best_sell["rate"]:
                best_sell = {"bank": b.get("name"), "slug": b.get("slug"), "rate": float(sell)}
    return best_buy, best_sell


async def get_or_create_state(db: AsyncSession) -> CurrencyModuleState:
    state = await db.get(CurrencyModuleState, 1)
    if state is None:
        state = CurrencyModuleState(
            id=1,
            enabled=bool(settings.CURRENCY_ENABLED),
            provider=settings.CURRENCY_PROVIDER or "wasyt",
            refresh_minutes=max(5, int(settings.CURRENCY_REFRESH_MINUTES or 15)),
        )
        db.add(state)
        await db.commit()
        await db.refresh(state)
    return state


async def get_cache(db: AsyncSession, currency: str, source_type: str = "bank") -> CurrencyRateCache | None:
    result = await db.execute(
        select(CurrencyRateCache).where(
            CurrencyRateCache.currency == currency.upper(),
            CurrencyRateCache.source_type == source_type,
        )
    )
    return result.scalar_one_or_none()


def _cache_payload(cache: CurrencyRateCache) -> dict:
    try:
        data = json.loads(cache.payload_json or "{}")
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def build_rates_response(cache: CurrencyRateCache | None, state: CurrencyModuleState, currency: str, source_type: str = "bank") -> dict:
    if cache is None:
        return {
            "currency": currency.upper(),
            "base": BASE_CURRENCY,
            "source_type": source_type,
            "provider": state.provider,
            "source_name": PROVIDER_NAME,
            "source_url": state.source_url or settings.CURRENCY_API_BASE_URL,
            "attribution": state.attribution or "bank.uz orqali Wasyt API",
            "updated_at": None,
            "fetched_at": _to_tashkent_iso(state.last_success_at),
            "is_stale": True,
            "stale_reason": "no_data",
            "best_buy": None,
            "best_sell": None,
            "banks": [],
        }
    payload = _cache_payload(cache)
    banks = payload.get("banks") or []
    best_buy = payload.get("best_buy")
    best_sell = payload.get("best_sell")
    return {
        "currency": currency.upper(),
        "base": BASE_CURRENCY,
        "source_type": source_type,
        "provider": cache.provider,
        "source_name": PROVIDER_NAME,
        "source_url": payload.get("source_url") or state.source_url or settings.CURRENCY_API_BASE_URL,
        "attribution": state.attribution or "bank.uz orqali Wasyt API",
        "updated_at": payload.get("updated_at") or _to_tashkent_iso(cache.source_updated_at),
        "fetched_at": _to_tashkent_iso(cache.fetched_at),
        "is_stale": bool(cache.is_stale),
        "stale_reason": cache.stale_reason or "",
        "best_buy": best_buy,
        "best_sell": best_sell,
        "banks": banks,
    }


async def fetch_wasyt_currency(currency: str, client: httpx.AsyncClient) -> dict:
    base = (settings.CURRENCY_API_BASE_URL or "https://api.wasyt.uz").rstrip("/")
    url = f"{base}/common/currency/banks"
    resp = await client.get(url, params={"currency": currency.upper()})
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, dict):
        raise ValueError("Invalid currency response")
    return data


def normalize_wasyt_payload(currency: str, data: dict) -> dict:
    raw_banks = data.get("banks") or []
    source_updated_at = data.get("updated_at")
    banks = []
    seen = set()
    for raw in raw_banks:
        if not isinstance(raw, dict):
            continue
        b = normalize_bank(raw, source_updated_at)
        if not b["name"]:
            continue
        key = (b["slug"] or b["name"].lower(), currency.upper())
        if key in seen:
            continue
        seen.add(key)
        banks.append(b)

    best_buy, best_sell = compute_best(banks)
    # Prefer provider best if it matches valid values, but compute ourselves to be safe.
    return {
        "currency": currency.upper(),
        "base": BASE_CURRENCY,
        "source_type": "bank",
        "source_url": str(data.get("source_url") or "https://bank.uz/uz/currency"),
        "updated_at": source_updated_at,
        "is_stale": bool(data.get("is_stale", False)),
        "cbu": data.get("cbu"),
        "best_buy": best_buy,
        "best_sell": best_sell,
        "banks": banks,
    }


async def refresh_currency_cache(db: AsyncSession, *, manual: bool = False) -> dict:
    state = await get_or_create_state(db)
    now = _now_utc()
    state.last_refresh_at = now
    if manual:
        state.last_manual_refresh_at = now

    provider = (settings.CURRENCY_PROVIDER or state.provider or "wasyt").lower()
    state.provider = provider
    timeout = max(5, int(settings.CURRENCY_REQUEST_TIMEOUT or 15))
    errors: list[str] = []
    updated: list[str] = []

    async with httpx.AsyncClient(timeout=timeout, headers={"Accept": "application/json"}) as client:
        for currency in SUPPORTED_CURRENCIES:
            try:
                if provider != "wasyt":
                    raise ValueError(f"Unsupported currency provider: {provider}")
                raw = await fetch_wasyt_currency(currency, client)
                payload = normalize_wasyt_payload(currency, raw)
                cache = await get_cache(db, currency, "bank")
                if cache is None:
                    cache = CurrencyRateCache(currency=currency, source_type="bank")
                    db.add(cache)
                cache.provider = provider
                cache.currency = currency
                cache.source_type = "bank"
                cache.payload_json = json.dumps(payload, ensure_ascii=False)
                cache.source_updated_at = _parse_dt(payload.get("updated_at"))
                cache.fetched_at = now
                cache.is_stale = bool(payload.get("is_stale", False))
                cache.stale_reason = "provider_stale" if cache.is_stale else ""
                state.source_url = payload.get("source_url") or state.source_url
                updated.append(currency)
            except Exception as exc:
                logger.warning("Currency refresh failed for %s: %s", currency, exc)
                errors.append(f"{currency}: {exc}")
                cache = await get_cache(db, currency, "bank")
                if cache is not None:
                    cache.is_stale = True
                    cache.stale_reason = "refresh_failed"

    if updated:
        state.last_success_at = now
        state.last_error = "; ".join(errors)[:1000]
        state.last_error_at = now if errors else state.last_error_at
        if not errors:
            state.last_error = ""
    else:
        state.last_error = "; ".join(errors)[:1000] or "Unknown refresh error"
        state.last_error_at = now

    state.attribution = "bank.uz orqali Wasyt API"
    await db.commit()
    return {"updated": updated, "errors": errors, "last_success_at": _to_tashkent_iso(state.last_success_at)}


def _find_bank(banks: list[dict], bank_slug: str | None) -> dict | None:
    if not bank_slug:
        return None
    s = bank_slug.strip().lower()
    for b in banks:
        if str(b.get("slug") or "").lower() == s:
            return b
    return None


def _rate_for_operation(bank: dict, operation: str) -> float | None:
    op = operation.lower()
    if op == "buy":
        return _clean_rate(bank.get("buy"))
    if op == "sell":
        return _clean_rate(bank.get("sell"))
    return None


async def convert_amount(db: AsyncSession, *, amount: float, from_currency: str, to_currency: str, operation: str, bank_slug: str | None, source_type: str = "bank") -> dict:
    from_c = from_currency.upper()
    to_c = to_currency.upper()
    op = operation.lower()
    if from_c not in SUPPORTED_CURRENCIES + [BASE_CURRENCY] or to_c not in SUPPORTED_CURRENCIES + [BASE_CURRENCY]:
        raise ValueError("Unsupported currency")
    if from_c == to_c:
        return {
            "amount": amount, "from": from_c, "to": to_c, "operation": op,
            "bank": None, "bank_slug": None, "rate": 1.0, "result": amount,
            "currency": from_c, "base": BASE_CURRENCY, "source_type": source_type,
            "updated_at": None, "is_stale": False, "warning": "",
        }
    if op not in ("buy", "sell"):
        raise ValueError("operation must be buy or sell")

    state = await get_or_create_state(db)

    async def get_pair(currency: str) -> dict:
        cache = await get_cache(db, currency, source_type)
        return build_rates_response(cache, state, currency, source_type)

    def pick_bank(resp: dict, want_op: str, explicit_slug: str | None) -> tuple[dict | None, float | None]:
        banks = resp.get("banks") or []
        if explicit_slug and explicit_slug != "best":
            b = _find_bank(banks, explicit_slug)
            if not b:
                return None, None
            return b, _rate_for_operation(b, want_op)
        # best: buy => max buy, sell => min sell
        best = None
        best_rate = None
        for b in banks:
            r = _rate_for_operation(b, want_op)
            if r is None:
                continue
            if best is None:
                best, best_rate = b, r
                continue
            if want_op == "buy" and r > best_rate:
                best, best_rate = b, r
            if want_op == "sell" and r < best_rate:
                best, best_rate = b, r
        return best, best_rate

    warning = "Hisob-kitob taxminiy. Yakuniy kurs bank tomonidan belgilanadi."
    is_stale = False
    updated_at = None

    # Direct foreign <-> UZS
    if BASE_CURRENCY in (from_c, to_c):
        foreign = from_c if from_c != BASE_CURRENCY else to_c
        resp = await get_pair(foreign)
        is_stale = bool(resp.get("is_stale"))
        updated_at = resp.get("updated_at")
        # direction: foreign->UZS means bank buys foreign (buy); UZS->foreign means bank sells foreign (sell)
        needed_op = "buy" if from_c == foreign and to_c == BASE_CURRENCY else "sell"
        b, rate = pick_bank(resp, needed_op, bank_slug)
        if not b or rate is None:
            return {
                "amount": amount, "from": from_c, "to": to_c, "operation": op,
                "bank": b.get("name") if b else None, "bank_slug": b.get("slug") if b else bank_slug,
                "rate": rate, "result": None, "currency": foreign, "base": BASE_CURRENCY,
                "source_type": source_type, "updated_at": updated_at, "is_stale": is_stale,
                "warning": warning,
            }
        result = amount * rate if needed_op == "buy" else (amount / rate if rate else None)
        return {
            "amount": amount, "from": from_c, "to": to_c, "operation": needed_op,
            "bank": b.get("name"), "bank_slug": b.get("slug"), "rate": rate,
            "result": round(result, 2) if result is not None else None,
            "currency": foreign, "base": BASE_CURRENCY, "source_type": source_type,
            "updated_at": updated_at, "is_stale": is_stale, "warning": warning,
        }

    # Cross: EUR<->RUB via UZS. operation chosen by user: buy/sell means how to treat getting target? 
    # We'll interpret: amount in from_c -> convert to UZS using bank buy for from_c, then UZS -> to_c using bank sell for to_c.
    # This is the practical "exchange" path. We expose operation as "cross".
    resp_from = await get_pair(from_c)
    resp_to = await get_pair(to_c)
    is_stale = bool(resp_from.get("is_stale") or resp_to.get("is_stale"))
    updated_at = resp_from.get("updated_at") or resp_to.get("updated_at")
    b1, rate_buy = pick_bank(resp_from, "buy", bank_slug)
    # For target leg, if same bank requested, try same slug; else best sell.
    target_slug = bank_slug if bank_slug and bank_slug != "best" else "best"
    b2, rate_sell = pick_bank(resp_to, "sell", target_slug)
    if not b1 or not b2 or rate_buy is None or rate_sell is None or rate_sell == 0:
        return {
            "amount": amount, "from": from_c, "to": to_c, "operation": "cross",
            "bank": b1.get("name") if b1 else None, "bank_slug": b1.get("slug") if b1 else bank_slug,
            "rate": None, "result": None, "currency": f"{from_c}/{to_c}", "base": BASE_CURRENCY,
            "source_type": source_type, "updated_at": updated_at, "is_stale": is_stale, "warning": warning,
        }
    uzs = amount * rate_buy
    result = uzs / rate_sell
    return {
        "amount": amount, "from": from_c, "to": to_c, "operation": "cross",
        "bank": f"{b1.get('name')} → {b2.get('name')}",
        "bank_slug": b1.get("slug"), "rate": rate_buy / rate_sell,
        "result": round(result, 4), "currency": f"{from_c}/{to_c}", "base": BASE_CURRENCY,
        "source_type": source_type, "updated_at": updated_at, "is_stale": is_stale, "warning": warning,
    }


async def ensure_cache_fresh(db: AsyncSession, max_age_minutes: int | None = None) -> None:
    state = await get_or_create_state(db)
    if not state.enabled:
        return
    age_min = max_age_minutes or max(5, int(state.refresh_minutes or settings.CURRENCY_REFRESH_MINUTES or 15))
    now = _now_utc()
    # check any missing/stale by age
    needs = False
    for cur in SUPPORTED_CURRENCIES:
        cache = await get_cache(db, cur, "bank")
        if cache is None or cache.fetched_at is None:
            needs = True
            break
        if cache.fetched_at.tzinfo is None:
            fetched = cache.fetched_at.replace(tzinfo=timezone.utc)
        else:
            fetched = cache.fetched_at
        if (now - fetched) > timedelta(minutes=age_min):
            needs = True
            break
    if needs:
        # avoid stampede: only refresh if last_refresh_at old enough or never
        if state.last_refresh_at:
            lr = state.last_refresh_at
            if lr.tzinfo is None:
                lr = lr.replace(tzinfo=timezone.utc)
            if (now - lr) < timedelta(seconds=60):
                return
        await refresh_currency_cache(db)
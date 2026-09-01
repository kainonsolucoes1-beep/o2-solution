"""Calendário de dias úteis no Brasil — feriados nacionais fixos + móveis
(Carnaval, Sexta-feira Santa e Corpus Christi, derivados da Páscoa)."""
import calendar as _cal
from datetime import date, timedelta

_FIXED = ((1, 1), (4, 21), (5, 1), (9, 7), (10, 12), (11, 2), (11, 15), (11, 20), (12, 25))
_CACHE: dict[int, set] = {}


def easter(year: int) -> date:
    a = year % 19
    b, c = year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def br_holidays(year: int) -> set:
    if year not in _CACHE:
        e = easter(year)
        movable = {e + timedelta(days=n) for n in (-48, -47, -2, 60)}
        _CACHE[year] = {date(year, mm, dd) for mm, dd in _FIXED} | movable
    return _CACHE[year]


def is_business_day(d: date) -> bool:
    return d.weekday() < 5 and d not in br_holidays(d.year)


def business_days_in_month(year: int, month: int, up_to_day: int | None = None) -> int:
    last = _cal.monthrange(year, month)[1]
    end = last if up_to_day is None else min(up_to_day, last)
    return sum(1 for day in range(1, end + 1) if is_business_day(date(year, month, day)))

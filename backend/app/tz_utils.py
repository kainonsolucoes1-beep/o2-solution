from datetime import date, datetime, timedelta, timezone

# Brasil (America/Sao_Paulo) nao observa horario de verao desde 2019 -- offset fixo.
BR_OFFSET = timedelta(hours=3)


def now_br() -> datetime:
    """Agora, em horario de Brasilia (naive -- mesma convencao naive-UTC usada no banco)."""
    return datetime.now(timezone.utc).replace(tzinfo=None) - BR_OFFSET


def br_date_to_utc_range(d: str | date) -> tuple[datetime, datetime]:
    """Dado um dia no calendario de Brasilia (date ou string 'YYYY-MM-DD'), retorna o
    intervalo em UTC [inicio, fim) que corresponde a esse dia local (00h-24h em Brasilia).
    Usar sempre que uma data vinda do usuario/frontend (que pensa em horario local)
    for comparada contra colunas de timestamp guardadas em UTC no banco."""
    if isinstance(d, str):
        d = datetime.strptime(d, "%Y-%m-%d").date()
    start_local = datetime(d.year, d.month, d.day)
    start_utc = start_local + BR_OFFSET
    return start_utc, start_utc + timedelta(days=1)


def today_utc_range() -> tuple[datetime, datetime]:
    """Intervalo UTC correspondente ao 'hoje' em horario de Brasilia."""
    return br_date_to_utc_range(now_br().date())


def br_month_utc_range(year: int, month: int) -> tuple[datetime, datetime]:
    """Intervalo UTC correspondente a um mes inteiro no calendario de Brasilia."""
    start_local = datetime(year, month, 1)
    end_local = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    return start_local + BR_OFFSET, end_local + BR_OFFSET

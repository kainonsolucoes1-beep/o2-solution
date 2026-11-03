"""Financeiro > Tráfego pago: investimento semanal em Google Ads e Meta Ads,
cruzado com os leads e as vendas que cada plataforma trouxe no período."""
import calendar
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.api.gestao_comercial_routes import VENDA_STATUSES
from app.database import get_db
from app.models.lead import Lead
from app.models.trafego import TrafegoGasto
from app.models.user import User
from app.security import can_see_financials
from app.tz_utils import br_date_to_utc_range, now_br

router = APIRouter(prefix="/api/v1/financeiro/trafego", tags=["financeiro"])

PLATAFORMAS = ("google", "meta")
MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
         "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
MESES_ABREV = ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

# Como o lead e' atribuido a cada plataforma: campo "Campanha" da ficha
# (campanha_midia) ou a origem do canal. Meta Ads vem do webhook nativo e da
# API publica com origin "Meta Ads".
_META_ORIGENS = ("meta ads", "meta", "facebook", "facebook ads", "instagram", "instagram ads")


def _plataforma_filter(plataforma: str):
    campanha = func.lower(func.trim(func.coalesce(Lead.campanha_midia, "")))
    origem = func.lower(func.trim(func.coalesce(Lead.origin, "")))
    if plataforma == "google":
        return or_(campanha == "google", origem == "google")
    return or_(campanha == "meta", origem.in_(_META_ORIGENS))


def _parse_mes(mes: Optional[str]) -> tuple[int, int]:
    if not mes:
        hoje = now_br().date()
        return hoje.year, hoje.month
    try:
        y, m = (int(p) for p in mes.split("-"))
        date(y, m, 1)
        return y, m
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Mês inválido (use AAAA-MM).")


def _semanas_do_mes(y: int, m: int) -> list[tuple[date, date]]:
    """Semanas seg-dom recortadas no mês: a 1ª começa no dia 1 e a última
    termina no último dia, então nenhuma semana mistura dois meses. Ponta com
    menos de 3 dias (ex.: mês que começa num domingo) junta com a semana
    vizinha, pra não ter semana de 1 dia."""
    ultimo = date(y, m, calendar.monthrange(y, m)[1])
    semanas, inicio = [], date(y, m, 1)
    while inicio <= ultimo:
        fim = min(inicio + timedelta(days=6 - inicio.weekday()), ultimo)
        semanas.append((inicio, fim))
        inicio = fim + timedelta(days=1)
    curta = lambda s: (s[1] - s[0]).days + 1 < 3
    if len(semanas) > 1 and curta(semanas[0]):
        semanas[:2] = [(semanas[0][0], semanas[1][1])]
    if len(semanas) > 1 and curta(semanas[-1]):
        semanas[-2:] = [(semanas[-2][0], semanas[-1][1])]
    return semanas


def _utc_range(inicio: date, fim: date) -> tuple[datetime, datetime]:
    return br_date_to_utc_range(inicio)[0], br_date_to_utc_range(fim)[1]


def _leads_e_vendas(db: Session, plataforma: str, inicio: date, fim: date) -> tuple[int, int, float]:
    """Leads captados no intervalo (created_at, horário de Brasília) e, deles,
    quantos viraram venda e quanto somam -- retrabalho/renutrição não conta
    como captação de tráfego pago."""
    de, ate = _utc_range(inicio, fim)
    base = [Lead.created_at >= de, Lead.created_at < ate, _plataforma_filter(plataforma)]
    leads = db.query(func.count(Lead.id)).filter(*base).scalar() or 0
    vendas, valor = (
        db.query(func.count(Lead.id), func.coalesce(func.sum(Lead.value_potential), 0))
        .filter(*base, Lead.status.in_(VENDA_STATUSES))
        .one()
    )
    return int(leads), int(vendas or 0), float(valor or 0)


def _resumo(gasto: float, leads: int, vendas: int, valor: float) -> dict:
    return {
        "gasto": round(gasto, 2),
        "leads": leads,
        "vendas": vendas,
        "valor_vendas": round(valor, 2),
        "cpl": round(gasto / leads, 2) if leads and gasto else None,
        "custo_venda": round(gasto / vendas, 2) if vendas and gasto else None,
        "retorno": round(valor / gasto, 2) if gasto else None,
        "conversao": round(vendas / leads * 100, 1) if leads else None,
    }


def _gastos(db: Session, inicio: date, fim: date) -> dict:
    rows = db.query(TrafegoGasto).filter(TrafegoGasto.semana_inicio >= inicio, TrafegoGasto.semana_inicio <= fim).all()
    return {(r.plataforma, r.semana_inicio): float(r.valor) for r in rows}


@router.get("")
def trafego_mes(
    mes: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Sem permissão.")
    y, m = _parse_mes(mes)
    hoje = now_br().date()
    semanas = _semanas_do_mes(y, m)
    primeiro, ultimo = semanas[0][0], semanas[-1][1]
    gastos = _gastos(db, primeiro, ultimo)
    aberto = ultimo >= hoje

    semanas_out = []
    for n, (ini, fim) in enumerate(semanas, start=1):
        situacao = "futura" if ini > hoje else "atual" if fim >= hoje else "fechada"
        linha = {
            "numero": n, "inicio": ini.isoformat(), "fim": fim.isoformat(),
            "label": f"{ini.day:02d}/{ini.month:02d}" + ("" if ini == fim else f" – {fim.day:02d}/{fim.month:02d}"),
            "situacao": situacao, "plataformas": {},
        }
        for p in PLATAFORMAS:
            valor = gastos.get((p, ini))
            leads, vendas, vv = (0, 0, 0.0) if situacao == "futura" else _leads_e_vendas(db, p, ini, fim)
            linha["plataformas"][p] = {"lancado": valor is not None, **_resumo(valor or 0.0, leads, vendas, vv)}
        semanas_out.append(linha)

    plataformas = {}
    for p in PLATAFORMAS:
        gasto = sum(v for (pp, _), v in gastos.items() if pp == p)
        leads, vendas, vv = _leads_e_vendas(db, p, primeiro, min(ultimo, hoje) if aberto else ultimo)
        plataformas[p] = _resumo(gasto, leads, vendas, vv)
    total = _resumo(
        sum(plataformas[p]["gasto"] for p in PLATAFORMAS),
        sum(plataformas[p]["leads"] for p in PLATAFORMAS),
        sum(plataformas[p]["vendas"] for p in PLATAFORMAS),
        sum(plataformas[p]["valor_vendas"] for p in PLATAFORMAS),
    )

    # Últimos 6 meses (incluindo o atual da tela) pra comparar a evolução
    historico = []
    hy, hm = y, m
    for _ in range(6):
        sem = _semanas_do_mes(hy, hm)
        ini, fim = sem[0][0], sem[-1][1]
        if ini > hoje:
            break
        g = _gastos(db, ini, fim)
        item = {"mes": f"{hy:04d}-{hm:02d}", "label": f"{MESES_ABREV[hm]}/{str(hy)[2:]}", "plataformas": {}}
        for p in PLATAFORMAS:
            leads, vendas, vv = _leads_e_vendas(db, p, ini, min(fim, hoje))
            item["plataformas"][p] = _resumo(sum(v for (pp, _), v in g.items() if pp == p), leads, vendas, vv)
        historico.append(item)
        hm -= 1
        if hm == 0:
            hy, hm = hy - 1, 12
    historico.reverse()

    return {
        "mes": f"{y:04d}-{m:02d}",
        "mes_label": f"{MESES[m]}/{y}",
        "status": "aberto" if aberto else "fechado",
        "semanas": semanas_out,
        "plataformas": plataformas,
        "total": total,
        "historico": historico,
    }


class GastoIn(BaseModel):
    plataforma: str
    semana_inicio: date
    valor: Optional[float] = None  # None (ou vazio) apaga o lançamento


@router.put("/gasto")
def salvar_gasto(
    body: GastoIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Sem permissão.")
    if body.plataforma not in PLATAFORMAS:
        raise HTTPException(status_code=422, detail="Plataforma inválida.")
    d = body.semana_inicio
    if d not in {ini for ini, _ in _semanas_do_mes(d.year, d.month)}:
        raise HTTPException(status_code=422, detail="Data não é o início de uma semana do mês.")
    if d > now_br().date():
        raise HTTPException(status_code=422, detail="Essa semana ainda não começou.")
    if body.valor is not None and (body.valor < 0 or body.valor > 10_000_000):
        raise HTTPException(status_code=422, detail="Valor inválido.")

    row = db.query(TrafegoGasto).filter(TrafegoGasto.plataforma == body.plataforma, TrafegoGasto.semana_inicio == d).first()
    if body.valor is None:
        if row:
            db.delete(row)
    elif row:
        row.valor = body.valor
        row.updated_by = current_user.first_name or current_user.username
        row.updated_at = func.now()
    else:
        db.add(TrafegoGasto(plataforma=body.plataforma, semana_inicio=d, valor=body.valor,
                            updated_by=current_user.first_name or current_user.username))
    db.commit()
    return {"success": True}

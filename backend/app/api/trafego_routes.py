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
from app.api.gestao_comercial_routes import PROPOSTA_STATUSES, VENDA_STATUSES
from app.database import get_db
from app.lead_utils import normalize_conversion_point
from app.models.lead import Lead
from app.models.trafego import TrafegoGasto, TrafegoGastoCampanha, TrafegoVerba
from app.models.user import User
from app.security import can_see_financials
from app.tz_utils import BR_OFFSET, br_date_to_utc_range, now_br

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


# ---- Equipe > Tráfego pago: visão por campanha (= ponto de conversão) -------
_TEMPS = ("Quente", "Morno", "Frio plus", "Frio")
_NAO_CONTATADO = {"novo", "new", "pending"}
_PROPOSTA_OU_ALEM = {s.lower() for s in PROPOSTA_STATUSES + VENDA_STATUSES}
_VENDA = {s.lower() for s in VENDA_STATUSES}
_PERDIDO = "sale_not_performed"


def _rows(db: Session, plataforma: str, inicio: date, fim: date):
    de, ate = _utc_range(inicio, fim)
    return (
        db.query(Lead.created_at, Lead.conversion_point, Lead.perception, Lead.status, Lead.value_potential, Lead.lost_reason)
        .filter(Lead.created_at >= de, Lead.created_at < ate, _plataforma_filter(plataforma))
        .all()
    )


def _agrega(rows, inicio: date, dias: int) -> dict:
    """Agrupa os leads por campanha (ponto de conversão normalizado)."""
    camps: dict = {}
    for created, cp, perc, status, valor, motivo in rows:
        nome = normalize_conversion_point(cp)
        c = camps.setdefault(nome, {
            "nome": nome, "leads": 0, "temperatura": [0, 0, 0, 0, 0], "contatados": 0, "propostas": 0,
            "vendas": 0, "valor_vendas": 0.0, "vendas_temp": [0, 0, 0, 0], "perdidos": 0, "motivos": {},
            "diario": [{"leads": 0, "vendas": 0} for _ in range(dias)],
        })
        st = (status or "").strip().lower()
        ti = _TEMPS.index(perc) if perc in _TEMPS else len(_TEMPS)
        dia = ((created - BR_OFFSET).date() - inicio).days if created else -1
        c["leads"] += 1
        c["temperatura"][ti] += 1
        if 0 <= dia < dias:
            c["diario"][dia]["leads"] += 1
        if st and st not in _NAO_CONTATADO:
            c["contatados"] += 1
        if st in _PROPOSTA_OU_ALEM:
            c["propostas"] += 1
        if st in _VENDA:
            c["vendas"] += 1
            c["valor_vendas"] += float(valor or 0)
            if ti < len(_TEMPS):
                c["vendas_temp"][ti] += 1
            if 0 <= dia < dias:
                c["diario"][dia]["vendas"] += 1
        if st == _PERDIDO:
            c["perdidos"] += 1
            m = (motivo or "").strip() or "Sem motivo informado"
            c["motivos"][m] = c["motivos"].get(m, 0) + 1
    for c in camps.values():
        c["valor_vendas"] = round(c["valor_vendas"], 2)
        c["motivos"] = sorted(c["motivos"].items(), key=lambda x: -x[1])[:4]
    return camps


def _gastos_campanha(db: Session, plataforma: str, mes: str) -> dict:
    """Investimento do mês por campanha (lançado à mão)."""
    rows = db.query(TrafegoGastoCampanha).filter(TrafegoGastoCampanha.plataforma == plataforma, TrafegoGastoCampanha.mes == mes).all()
    return {r.campanha: float(r.valor) for r in rows}


def _saldo(db: Session, plataforma: str, mes: str) -> Optional[float]:
    """Saldo que ainda resta do investimento do mês (guardado em trafego_verbas,
    endpoint PUT /verba -- a tabela nasceu como "verba do mês")."""
    row = db.query(TrafegoVerba).filter(TrafegoVerba.plataforma == plataforma, TrafegoVerba.mes == mes).first()
    return float(row.valor) if row else None


@router.get("/campanhas")
def trafego_campanhas(
    plataforma: str = Query("meta"),
    mes: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Sem permissão.")
    if plataforma not in PLATAFORMAS:
        raise HTTPException(status_code=422, detail="Plataforma inválida.")
    y, m = _parse_mes(mes)
    hoje = now_br().date()
    dias_mes = calendar.monthrange(y, m)[1]
    inicio = date(y, m, 1)
    if inicio > hoje:
        raise HTTPException(status_code=422, detail="Mês ainda não começou.")
    fim = min(date(y, m, dias_mes), hoje)
    dias = (fim - inicio).days + 1

    # mesmo recorte de dias no mês anterior, pra comparar
    py, pm = (y - 1, 12) if m == 1 else (y, m - 1)
    p_ini = date(py, pm, 1)
    p_fim = date(py, pm, min(dias, calendar.monthrange(py, pm)[1]))

    atual = _agrega(_rows(db, plataforma, inicio, fim), inicio, dias)
    anterior = _agrega(_rows(db, plataforma, p_ini, p_fim), p_ini, (p_fim - p_ini).days + 1)
    # Lançamento manual (2026-11-23): por campanha, o INVESTIMENTO do mês
    # (trafego_gastos_campanha) e, por plataforma, o SALDO que ainda resta
    # (trafego_verbas). Gasto = investimento - saldo; o gasto de cada campanha
    # é estimado na proporção do investimento dela.
    mes_txt = f"{y:04d}-{m:02d}"
    g_camp = _gastos_campanha(db, plataforma, mes_txt)
    saldo = _saldo(db, plataforma, mes_txt)
    if g_camp:
        investimento, fonte = sum(g_camp.values()), "campanhas"
        gasto = max(0.0, investimento - saldo) if saldo is not None else investimento
    else:
        # sem nada por campanha, vale o lançamento semanal antigo (Financeiro > Tráfego pago)
        investimento = gasto = sum(v for (p, _), v in _gastos(db, inicio, date(y, m, dias_mes)).items() if p == plataforma)
        fonte = "semanas" if gasto else None
    fator = gasto / investimento if investimento else 0.0

    for nome, c in atual.items():
        a = anterior.get(nome)
        c["anterior"] = {"leads": a["leads"], "vendas": a["vendas"], "valor_vendas": a["valor_vendas"]} if a else None
        inv = g_camp.get(nome)
        c["investimento"] = inv
        c["gasto"] = round(inv * fator, 2) if inv is not None else None
    campanhas = sorted(atual.values(), key=lambda c: -c["leads"])
    # campanhas que aparecem na janela de lançamento: as do mês, as do mês
    # anterior (pode ter investimento antes do 1º lead) e as que já têm valor lançado
    lancamento = [c["nome"] for c in campanhas]
    lancamento += sorted(n for n in set(anterior) | set(g_camp) if n not in atual)

    # mês anterior: gasto (investimento - saldo) proporcional aos mesmos dias;
    # semanal antigo -> só as semanas que começaram até o mesmo dia
    ant_txt = f"{py:04d}-{pm:02d}"
    g_camp_ant = _gastos_campanha(db, plataforma, ant_txt)
    if g_camp_ant:
        inv_ant, saldo_ant = sum(g_camp_ant.values()), _saldo(db, plataforma, ant_txt)
        gasto_ant = max(0.0, inv_ant - (saldo_ant or 0.0)) * min(1.0, dias / calendar.monthrange(py, pm)[1])
    else:
        gasto_ant = sum(v for (p, _), v in _gastos(db, p_ini, p_fim).items() if p == plataforma)

    soma = lambda rows, k: sum(r[k] for r in rows)
    ant = list(anterior.values())
    return {
        "plataforma": plataforma,
        "mes": f"{y:04d}-{m:02d}",
        "inicio": inicio.isoformat(),
        "fim": fim.isoformat(),
        "dias_decorridos": dias,
        "dias_mes": dias_mes,
        "saldo": saldo,
        "gasto_fonte": fonte,
        "lancamento": lancamento,
        "gastos_campanha": g_camp,
        "total": {
            "investimento": round(investimento, 2),
            "gasto": round(gasto, 2),
            "leads": soma(campanhas, "leads"),
            "vendas": soma(campanhas, "vendas"),
            "valor_vendas": round(soma(campanhas, "valor_vendas"), 2),
            "temperatura": [sum(c["temperatura"][i] for c in campanhas) for i in range(len(_TEMPS) + 1)],
            "diario_leads": [sum(c["diario"][d]["leads"] for c in campanhas) for d in range(dias)],
        },
        "anterior": {
            "gasto": round(gasto_ant, 2),
            "leads": soma(ant, "leads"),
            "vendas": soma(ant, "vendas"),
            "valor_vendas": round(soma(ant, "valor_vendas"), 2),
        },
        "campanhas": campanhas,
    }


class VerbaIn(BaseModel):
    plataforma: str
    mes: str
    valor: Optional[float] = None  # None apaga


@router.put("/verba")
def salvar_verba(
    body: VerbaIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Sem permissão.")
    if body.plataforma not in PLATAFORMAS:
        raise HTTPException(status_code=422, detail="Plataforma inválida.")
    y, m = _parse_mes(body.mes)
    mes = f"{y:04d}-{m:02d}"
    if body.valor is not None and (body.valor < 0 or body.valor > 10_000_000):
        raise HTTPException(status_code=422, detail="Valor inválido.")
    row = db.query(TrafegoVerba).filter(TrafegoVerba.plataforma == body.plataforma, TrafegoVerba.mes == mes).first()
    quem = current_user.first_name or current_user.username
    if body.valor is None:
        if row:
            db.delete(row)
    elif row:
        row.valor, row.updated_by, row.updated_at = body.valor, quem, func.now()
    else:
        db.add(TrafegoVerba(plataforma=body.plataforma, mes=mes, valor=body.valor, updated_by=quem))
    db.commit()
    return {"success": True}


class GastoCampanhaItem(BaseModel):
    campanha: str
    valor: Optional[float] = None  # None apaga


class GastosCampanhaIn(BaseModel):
    plataforma: str
    mes: str
    itens: list[GastoCampanhaItem]


@router.put("/gastos-campanha")
def salvar_gastos_campanha(
    body: GastosCampanhaIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Grava de uma vez o gasto do mês de cada campanha (janela "Lançar gastos")."""
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Sem permissão.")
    if body.plataforma not in PLATAFORMAS:
        raise HTTPException(status_code=422, detail="Plataforma inválida.")
    y, m = _parse_mes(body.mes)
    if date(y, m, 1) > now_br().date():
        raise HTTPException(status_code=422, detail="Esse mês ainda não começou.")
    mes = f"{y:04d}-{m:02d}"
    quem = current_user.first_name or current_user.username
    existentes = {
        r.campanha: r for r in db.query(TrafegoGastoCampanha)
        .filter(TrafegoGastoCampanha.plataforma == body.plataforma, TrafegoGastoCampanha.mes == mes).all()
    }
    for it in body.itens:
        nome = (it.campanha or "").strip()
        if not nome or len(nome) > 255:
            raise HTTPException(status_code=422, detail="Campanha inválida.")
        if it.valor is not None and (it.valor < 0 or it.valor > 10_000_000):
            raise HTTPException(status_code=422, detail=f"Valor inválido em {nome}.")
        row = existentes.get(nome)
        if it.valor is None:
            if row:
                db.delete(row)
        elif row:
            row.valor, row.updated_by, row.updated_at = it.valor, quem, func.now()
        else:
            db.add(TrafegoGastoCampanha(plataforma=body.plataforma, mes=mes, campanha=nome, valor=it.valor, updated_by=quem))
    db.commit()
    return {"success": True}


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

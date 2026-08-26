import csv
import io
import re
from datetime import date, datetime
from typing import Optional

import openpyxl
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.lead import Lead

_HEADER_ALIASES = {
    "nome": {"nome", "cliente", "name"},
    "telefone": {"telefone", "fone", "celular", "phone", "whatsapp"},
    "modalidade": {"modalidade"},
    "data": {"data de reativacao", "data de reativação", "data reativacao", "data reativação", "reativado_em", "data"},
}


def _strip_accents(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _normalize_header(h: str) -> str:
    return _strip_accents(str(h or "").strip().lower())


def _map_headers(headers: list[str]) -> dict[str, int]:
    """Acha, pra cada campo esperado, o indice da coluna cujo cabecalho bate
    (ignorando acento/maiusculas). Levanta ValueError se faltar nome/telefone."""
    normalized = [_normalize_header(h) for h in headers]
    mapping: dict[str, int] = {}
    for field, aliases in _HEADER_ALIASES.items():
        for i, h in enumerate(normalized):
            if h in aliases:
                mapping[field] = i
                break
    if "nome" not in mapping or "telefone" not in mapping:
        raise ValueError("A planilha precisa ter pelo menos as colunas Nome e Telefone")
    return mapping


def _cell_to_text(value) -> str:
    """Converte o valor bruto da celula pra texto. Excel costuma guardar uma
    coluna de telefone como numero (nao texto) se o usuario nao formatar a
    coluna antes -- um float puro vira '5511...878.0' (str() de float sempre
    adiciona '.0'), e esse ponto sobra como um digito espurio depois do
    regexp_replace. Numero inteiro vira texto sem essa cauda."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _phone_key(raw: str) -> str:
    """Ultimos 8 digitos do telefone -- ignora DDI/DDD e o '9' extra do
    celular, que variam entre a planilha e o cadastro do lead."""
    digits = re.sub(r"\D", "", raw or "")
    return digits[-8:] if len(digits) >= 8 else digits


def _parse_date_cell(value) -> Optional[str]:
    """Retorna AAAA-MM-DD, ou None se vazio/invalido. Aceita data nativa do
    Excel, ou texto DD/MM/AAAA / DD/MM (ano corrente, se omitido)."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return None
    for fmt in (
        "%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S",  # export de banco/planilha com timestamp completo
        "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    m = re.match(r"^(\d{1,2})/(\d{1,2})$", text)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        try:
            return date(datetime.now().year, month, day).isoformat()
        except ValueError:
            return None
    return None


def _read_rows(filename: str, content: bytes) -> list[list]:
    name = (filename or "").lower()
    if name.endswith(".csv"):
        text = content.decode("utf-8-sig", errors="replace")
        delimiter = ";" if text.count(";") >= text.count(",") else ","
        reader = csv.reader(io.StringIO(text), delimiter=delimiter)
        return [row for row in reader if any((c or "").strip() for c in row)]

    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    ws = wb.active
    rows = []
    for row in ws.iter_rows(values_only=True):
        if any(c not in (None, "") for c in row):
            rows.append(list(row))
    return rows


def parse_and_match(db: Session, filename: str, content: bytes) -> list[dict]:
    raw_rows = _read_rows(filename, content)
    if not raw_rows:
        raise ValueError("Planilha vazia")

    headers = raw_rows[0]
    col = _map_headers(headers)
    data_rows = raw_rows[1:]

    # carrega todos os leads de uma vez (id, nome, telefone) pra casar em memoria,
    # em vez de uma query por linha da planilha
    leads_by_phone: dict[str, list] = {}
    for lead_id, lead_name, phone in db.query(Lead.id, Lead.name, Lead.phone).filter(Lead.phone.isnot(None)).all():
        key = _phone_key(phone)
        if key:
            leads_by_phone.setdefault(key, []).append((lead_id, lead_name))

    results = []
    for i, row in enumerate(data_rows, start=2):  # linha 2 = primeira linha de dados (1 = cabecalho)
        def cell(field):
            idx = col.get(field)
            return row[idx] if idx is not None and idx < len(row) else None

        nome = _cell_to_text(cell("nome"))
        telefone_raw = _cell_to_text(cell("telefone"))
        modalidade = _cell_to_text(cell("modalidade")) or None
        data_reativacao = _parse_date_cell(cell("data"))

        if not nome and not telefone_raw:
            continue

        key = _phone_key(telefone_raw)
        matches = leads_by_phone.get(key, []) if key else []

        if not telefone_raw or not key:
            status, lead_id, lead_nome_atual, detail = "not_found", None, None, "telefone vazio ou inválido"
        elif not data_reativacao:
            status, lead_id, lead_nome_atual, detail = "invalid_date", None, None, "data de reativação vazia ou inválida"
        elif len(matches) == 0:
            status, lead_id, lead_nome_atual, detail = "not_found", None, None, "telefone não encontrado"
        elif len(matches) > 1:
            status, lead_id, lead_nome_atual, detail = "ambiguous", None, None, f"{len(matches)} leads com esse telefone"
        else:
            status, lead_id, lead_nome_atual, detail = "ok", str(matches[0][0]), matches[0][1], "lead encontrado"

        results.append({
            "row": i,
            "nome": nome,
            "telefone": telefone_raw,
            "modalidade": modalidade,
            "data_reativacao": data_reativacao,
            "match_status": status,
            "lead_id": lead_id,
            "lead_nome_atual": lead_nome_atual,
            "detail": detail,
        })

    return results

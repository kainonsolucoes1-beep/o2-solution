import asyncio
import logging
import os
import re
from collections import defaultdict
from datetime import datetime

from google.oauth2 import service_account
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.models.lead import Lead

logger = logging.getLogger(__name__)

SPREADSHEET_ID = "1AcNQ5DEgz92IJ4GuuYkwgvr_THnVdKRki-R7c8uTNwY"
SHEET_TITLE = "UNIFICACAO"
STATUS_ALVO = "PAGO - FINALIZADO"
CREDS_PATH = os.getenv(
    "GOOGLE_SERVICE_ACCOUNT_PATH",
    os.path.join(os.path.dirname(__file__), "..", "google_service_account.json"),
)

# calibrado direto na planilha em 2026-07-23 — cor de fundo das celulas VALOR Nª
_GREEN = (0.20392157, 0.65882355, 0.3254902)   # recebido
_YELLOW = (1.0, 1.0, 0.0)                      # a receber
_COLOR_TOL = 0.03


def _color_matches(color: dict, target: tuple) -> bool:
    r, g, b = color.get("red", 0.0), color.get("green", 0.0), color.get("blue", 0.0)
    return abs(r - target[0]) < _COLOR_TOL and abs(g - target[1]) < _COLOR_TOL and abs(b - target[2]) < _COLOR_TOL


# normaliza grafias diferentes pro mesmo nome na planilha (ex: "VIVA SAUDE"/"VIVA" -> "Viva Saúde")
_PROMOTORA_ALIASES = {
    "viva saude": "Viva Saúde",
    "viva saúde": "Viva Saúde",
    "viva": "Viva Saúde",
    "bliss": "Bliss",
    "multinotas": "Multinotas",
    "allcross": "Allcross",
}
_MODALIDADE_ALIASES = {
    "pme": "PME",
    "pf": "PF",
    "odonto pf": "Odonto PF",
    "petlove": "Petlove",
}


def _normalize_label(raw: str | None, aliases: dict) -> str | None:
    if not raw or not raw.strip():
        return None
    key = raw.strip().lower()
    return aliases.get(key, raw.strip().title())


def _normalize_phone(s: str | None) -> str | None:
    if not s:
        return None
    digits = re.sub(r"\D", "", s)
    if len(digits) > 11 and digits.startswith("55"):
        digits = digits[2:]  # remove DDI +55, mantendo so DDD+numero
    return digits or None


def _normalize_email(s: str | None) -> str | None:
    if not s:
        return None
    e = s.strip().lower()
    return e or None


def _parse_sheet_date(s: str | None):
    if not s:
        return None
    try:
        return datetime.strptime(s.strip(), "%d/%m/%Y")
    except ValueError:
        return None


def _parse_brl(s: str | None) -> float:
    if not s:
        return 0.0
    s = s.replace("R$", "").strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _get_service():
    creds = service_account.Credentials.from_service_account_file(
        CREDS_PATH, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    return build("sheets", "v4", credentials=creds)


def _fetch_rows():
    svc = _get_service()
    resp = svc.spreadsheets().get(
        spreadsheetId=SPREADSHEET_ID,
        ranges=[f"'{SHEET_TITLE}'!A1:AC5000"],
        includeGridData=True,
        fields="sheets(data(rowData(values(formattedValue,effectiveFormat.backgroundColor))))",
    ).execute()
    return resp["sheets"][0]["data"][0]["rowData"]


def sync_receita_real(db: Session) -> dict:
    """Le a aba UNIFICACAO da planilha de vendas e preenche receita_real_recebida/
    receita_real_a_receber dos leads correspondentes (cruzamento por telefone, com
    fallback por e-mail). So considera linhas com STATUS = 'PAGO - FINALIZADO'."""
    row_data = _fetch_rows()
    if not row_data:
        return {"matched": 0, "matched_names": [], "unmatched": [], "ambiguous": []}

    header = [c.get("formattedValue") for c in row_data[0].get("values", [])]
    idx = {h: i for i, h in enumerate(header) if h}

    for col in ("TITULAR", "TELEFONE", "EMAIL", "STATUS"):
        if col not in idx:
            raise ValueError(f"Coluna obrigatória '{col}' não encontrada na aba {SHEET_TITLE}")

    phone_map: dict[str, list] = defaultdict(list)
    email_map: dict[str, list] = defaultdict(list)
    for lead in db.query(Lead).filter((Lead.phone.isnot(None)) | (Lead.email.isnot(None))).all():
        p = _normalize_phone(lead.phone)
        if p:
            phone_map[p].append(lead)
        e = _normalize_email(lead.email)
        if e:
            email_map[e].append(lead)

    matched_names, unmatched, ambiguous = [], [], []

    for row in row_data[1:]:
        vals = row.get("values", [])
        if not vals:
            continue

        def cell(col):
            i = idx.get(col)
            return vals[i] if i is not None and i < len(vals) else {}

        titular = cell("TITULAR").get("formattedValue") or "Sem nome"
        phone = _normalize_phone(cell("TELEFONE").get("formattedValue"))
        email = _normalize_email(cell("EMAIL").get("formattedValue"))

        candidates = phone_map.get(phone, []) if phone else []
        if not candidates and email:
            candidates = email_map.get(email, [])

        status = (cell("STATUS").get("formattedValue") or "").strip().upper()
        if status != STATUS_ALVO:
            # deixou de ser "pago - finalizado" (ex: revertido para boleto emitido) —
            # zera o que tinha sido marcado antes, senao fica um valor fantasma pra sempre
            if len(candidates) == 1:
                lead = candidates[0]
                if lead.receita_real_recebida or lead.receita_real_a_receber:
                    lead.receita_real_recebida = 0.0
                    lead.receita_real_a_receber = 0.0
                    lead.receita_titular = None
                    lead.receita_promotora = None
                    lead.receita_modalidade = None
                    lead.receita_data_venda = None
            continue

        if not candidates:
            unmatched.append(titular)
            continue
        if len(candidates) > 1:
            ambiguous.append(titular)
            continue

        recebido = 0.0
        a_receber = 0.0
        for n in range(1, 8):
            c = cell(f"VALOR {n}ª")
            valor = _parse_brl(c.get("formattedValue"))
            if not valor:
                continue
            color = c.get("effectiveFormat", {}).get("backgroundColor", {})
            if _color_matches(color, _GREEN):
                recebido += valor
            elif _color_matches(color, _YELLOW):
                a_receber += valor

        if recebido == 0.0 and a_receber == 0.0:
            # algumas vendas nao quebram em parcelas, usam so a coluna VALOR TOTAL
            ct = cell("VALOR TOTAL")
            valor_total = _parse_brl(ct.get("formattedValue"))
            if valor_total:
                color = ct.get("effectiveFormat", {}).get("backgroundColor", {})
                if _color_matches(color, _GREEN):
                    recebido = valor_total
                elif _color_matches(color, _YELLOW):
                    a_receber = valor_total

        lead = candidates[0]
        lead.receita_real_recebida = recebido
        lead.receita_real_a_receber = a_receber
        lead.receita_titular = titular
        lead.receita_promotora = _normalize_label(cell("PLATAFORMA").get("formattedValue"), _PROMOTORA_ALIASES)
        lead.receita_modalidade = _normalize_label(cell("MODALIDADE").get("formattedValue"), _MODALIDADE_ALIASES)
        lead.receita_data_venda = _parse_sheet_date(cell("DATA").get("formattedValue"))
        matched_names.append(titular)

    db.commit()
    return {
        "matched": len(matched_names),
        "matched_names": matched_names,
        "unmatched": unmatched,
        "ambiguous": ambiguous,
    }


async def start_receita_sync_scheduler() -> None:
    """Loop infinito: sincroniza a receita real da planilha a cada 5 minutos."""
    from app.database import SessionLocal
    while True:
        try:
            db = SessionLocal()
            try:
                result = await asyncio.to_thread(sync_receita_real, db)
                logger.info(
                    "Sync receita real concluido: %d cruzados, %d sem match, %d ambiguos",
                    result["matched"], len(result["unmatched"]), len(result["ambiguous"]),
                )
            finally:
                db.close()
        except Exception as exc:
            logger.error("Erro no scheduler de receita real: %s", exc)
        await asyncio.sleep(300)

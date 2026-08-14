import asyncio
import logging
import os
import re
from collections import defaultdict
from datetime import datetime

from google.oauth2 import service_account
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.models.lead import Lead, LeadParcela

logger = logging.getLogger(__name__)

SPREADSHEET_ID = "1AcNQ5DEgz92IJ4GuuYkwgvr_THnVdKRki-R7c8uTNwY"
SHEET_TITLE = "UNIFICACAO"
# todos representam venda ja certa, so' variando o ponto do fluxo de
# faturamento em que estao — usados como "aguardando pagamento" (a previsao
# de recebimento vem da nota da celula VALOR Nª, nao do texto do status).
STATUS_ALVO = {
    "PAGO - FINALIZADO",
    "ASSINATURA DE CONTRATO",
    "GERAR NOVO BOLETO",
    "PENDÊNCIA",
    "EMISSÃO",
    "BOLETO EMITIDO",
}
# "EMITIR BOLETO DIA 04/09" muda de texto conforme a data -- casa por prefixo
_STATUS_EMITIR_BOLETO_RE = re.compile(r"^EMITIR BOLETO DIA\b")
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


_NOTE_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?")


def _parse_note_date(note: str | None, reference: datetime | None) -> datetime | None:
    """Extrai uma data (DD/MM ou DD/MM/AA[AA]) de dentro do texto livre da nota
    da celula (ex: 'Recebimento previsto - 30/07', 'acerto ... pago dia 05/06').
    Quando o ano nao vem escrito, usa o ano de `reference` (a data da venda),
    avancando pro ano seguinte se a data cair antes da venda."""
    if not note:
        return None
    m = _NOTE_DATE_RE.search(note)
    if not m:
        return None
    day, month, year_raw = m.groups()
    try:
        day, month = int(day), int(month)
        if year_raw:
            year = int(year_raw)
            if year < 100:
                year += 2000
        elif reference:
            year = reference.year
        else:
            year = datetime.utcnow().year
        result = datetime(year, month, day)
        if not year_raw and reference and result < reference:
            result = datetime(year + 1, month, day)
        return result
    except ValueError:
        return None


# palavras que .title() erra: siglas (fica "Pme") e algarismos romanos (fica "Ii")
_ACRONYM_WORDS = {"pme", "pf"}
_ROMAN_RE = re.compile(r"^(?=[mdclxvi])m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$")


def _title_case(s: str) -> str:
    words = []
    for w in s.split():
        lw = w.lower()
        if lw in _ACRONYM_WORDS or _ROMAN_RE.match(lw):
            words.append(lw.upper())
        else:
            words.append(w.capitalize())
    return " ".join(words)


def _normalize_label(raw: str | None, aliases: dict) -> str | None:
    if not raw or not raw.strip():
        return None
    key = raw.strip().lower()
    return aliases.get(key, _title_case(raw.strip()))


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
    s = s.strip()
    try:
        return datetime.strptime(s, "%d/%m/%Y")
    except ValueError:
        pass
    try:
        # sem ano (ex: '11/03') -- assume o ano corrente
        return datetime.strptime(s, "%d/%m").replace(year=datetime.utcnow().year)
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


def _status_valido(status: str) -> bool:
    return status in STATUS_ALVO or bool(_STATUS_EMITIR_BOLETO_RE.match(status))


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
        fields="sheets(data(rowData(values(formattedValue,note,effectiveFormat.backgroundColor))))",
    ).execute()
    return resp["sheets"][0]["data"][0]["rowData"]


def sync_receita_real(db: Session) -> dict:
    """Le a aba UNIFICACAO da planilha de vendas e preenche receita_real_recebida/
    receita_real_a_receber dos leads correspondentes (cruzamento por telefone, com
    fallback por e-mail). So considera linhas com STATUS valido (venda ja certa,
    aguardando algum passo do faturamento ou ja paga — ver STATUS_ALVO)."""
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
        if not _status_valido(status):
            # saiu do grupo de status validos (ver STATUS_ALVO) —
            # zera o que tinha sido marcado antes, senao fica um valor fantasma pra sempre
            # (nunca mexe em lead com dado lancado manualmente na Ficha do Lead)
            if len(candidates) == 1:
                lead = candidates[0]
                if lead.receita_origem == "manual":
                    continue
                if lead.receita_real_recebida or lead.receita_real_a_receber:
                    lead.receita_real_recebida = 0.0
                    lead.receita_real_a_receber = 0.0
                    lead.receita_titular = None
                    lead.receita_promotora = None
                    lead.receita_modalidade = None
                    lead.receita_operadora = None
                    lead.receita_categoria = None
                    lead.receita_data_venda = None
                    db.query(LeadParcela).filter(LeadParcela.lead_id == lead.id).delete()
            continue

        if not candidates:
            unmatched.append(titular)
            continue
        if len(candidates) > 1:
            ambiguous.append(titular)
            continue

        data_venda = _parse_sheet_date(cell("DATA").get("formattedValue"))

        recebido = 0.0
        a_receber = 0.0
        parcelas = []  # (numero, valor, status, previsao_recebimento)
        for n in range(1, 8):
            c = cell(f"VALOR {n}ª")
            valor = _parse_brl(c.get("formattedValue"))
            if not valor:
                continue
            color = c.get("effectiveFormat", {}).get("backgroundColor", {})
            previsao = _parse_note_date(c.get("note"), data_venda)
            if _color_matches(color, _GREEN):
                recebido += valor
                parcelas.append((n, valor, "recebido", previsao))
            elif _color_matches(color, _YELLOW):
                a_receber += valor
                parcelas.append((n, valor, "a_receber", previsao))

        if recebido == 0.0 and a_receber == 0.0:
            # algumas vendas nao quebram em parcelas, usam so a coluna VALOR TOTAL
            ct = cell("VALOR TOTAL")
            valor_total = _parse_brl(ct.get("formattedValue"))
            if valor_total:
                color = ct.get("effectiveFormat", {}).get("backgroundColor", {})
                previsao = _parse_note_date(ct.get("note"), data_venda)
                if _color_matches(color, _GREEN):
                    recebido = valor_total
                    parcelas.append((None, valor_total, "recebido", previsao))
                elif _color_matches(color, _YELLOW):
                    a_receber = valor_total
                    parcelas.append((None, valor_total, "a_receber", previsao))

        lead = candidates[0]
        lead.receita_origem = "sheet"  # a planilha assume o controle, mesmo se estava 'manual'
        lead.receita_real_recebida = recebido
        lead.receita_real_a_receber = a_receber
        lead.receita_titular = titular
        lead.receita_promotora = _normalize_label(cell("PLATAFORMA").get("formattedValue"), _PROMOTORA_ALIASES)
        lead.receita_modalidade = _normalize_label(cell("MODALIDADE").get("formattedValue"), _MODALIDADE_ALIASES)
        lead.receita_operadora = (cell("OPERADORA").get("formattedValue") or "").strip() or None
        lead.receita_categoria = (cell("CATEGORIA").get("formattedValue") or "").strip() or None
        lead.receita_data_venda = data_venda
        matched_names.append(titular)

        db.query(LeadParcela).filter(LeadParcela.lead_id == lead.id).delete()
        for numero, valor, p_status, previsao in parcelas:
            db.add(LeadParcela(lead_id=lead.id, numero=numero, valor=valor, status=p_status, previsao_recebimento=previsao))

    db.commit()
    return {
        "matched": len(matched_names),
        "matched_names": matched_names,
        "unmatched": unmatched,
        "ambiguous": ambiguous,
    }


async def start_receita_sync_scheduler() -> None:
    """Loop infinito: sincroniza a receita real da planilha a cada 2 minutos."""
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
        await asyncio.sleep(120)

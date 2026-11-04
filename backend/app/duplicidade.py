"""Lead repetido NÃO é mais barrado (a pedido, 04/11/2026): todo envio vira
lead, e o repetido entra marcado como "possível duplicado" do lead que já
tinha o mesmo e-mail ou telefone -- nota na ficha + Lead.duplicado_de_id
(etiqueta no Relatório e aviso no topo da ficha).

O que continua bloqueado é só o reenvio TÉCNICO do mesmo lead: o webhook da
Meta repetindo o mesmo leadgen_id, ou a API pública repetindo o mesmo
id_externo (ver meta_webhook_routes / public_routes)."""
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.lead import Lead, LeadNote
from app.tz_utils import BR_OFFSET

# telefone só com dígitos e sem o 55 do país, pra "11 98765-4321" bater com "+55 11987654321"
_TEL_SQL = func.regexp_replace(
    func.regexp_replace(func.coalesce(Lead.phone, ""), r"\D", "", "g"),
    r"^55(\d{10,11})$", r"\1",
)


def normalizar_telefone(phone: Optional[str]) -> Optional[str]:
    d = re.sub(r"\D", "", phone or "")
    if len(d) in (12, 13) and d.startswith("55"):
        d = d[2:]
    return d if len(d) >= 10 else None


@dataclass
class LeadOriginal:
    id: object
    name: str
    created_at: Optional[datetime]
    campo: str  # qual dado bateu, já no texto do aviso: "o e-mail", "o telefone"...


def lead_parecido(email: Optional[str], phone: Optional[str]) -> Optional[LeadOriginal]:
    """O lead mais antigo com o mesmo e-mail ou telefone. Busca numa sessão
    própria, sem os filtros de visibilidade do usuário logado: o aviso de
    duplicado vale pra base toda, não só pro que a pessoa enxerga."""
    e = (email or "").strip().lower()
    t = normalizar_telefone(phone)
    conds = []
    if e:
        conds.append(func.lower(func.trim(Lead.email)) == e)
    if t:
        conds.append(_TEL_SQL == t)
    if not conds:
        return None
    db = SessionLocal()
    try:
        o = db.query(Lead).filter(or_(*conds)).order_by(Lead.created_at.asc()).first()
        if not o:
            return None
        bate_email = bool(e) and (o.email or "").strip().lower() == e
        bate_tel = bool(t) and normalizar_telefone(o.phone) == t
        campo = "o e-mail e o telefone" if bate_email and bate_tel else "o e-mail" if bate_email else "o telefone"
        return LeadOriginal(id=o.id, name=o.name, created_at=o.created_at, campo=campo)
    finally:
        db.close()


def marcar_duplicado(db: Session, novo: Lead, original: LeadOriginal, user_id=None) -> None:
    """Liga o lead novo ao original e deixa o aviso na ficha. Chamar depois do
    flush do lead novo (precisa do id)."""
    novo.duplicado_de_id = original.id
    quando = (original.created_at - BR_OFFSET).strftime("%d/%m/%Y") if original.created_at else ""
    db.add(LeadNote(
        lead_id=novo.id, user_id=user_id,
        content=(
            f"⚠️ Possível lead duplicado: {original.campo} deste cadastro já está no lead "
            f"\"{original.name}\"" + (f", cadastrado em {quando}" if quando else "") + "."
        ),
    ))

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models import Notificacao, User

router = APIRouter(prefix="/api/v1/notificacoes", tags=["notificacoes"])


def notificar(db: Session, destinatario_id, por: User, texto: str, lead_id=None) -> None:
    """Cria um aviso no sino de quem recebeu. Não avisa a pessoa sobre algo
    que ela mesma fez. Não faz commit -- vai junto com a ação que gerou."""
    if not destinatario_id or destinatario_id == por.id:
        return
    db.add(Notificacao(user_id=destinatario_id, lead_id=lead_id, texto=texto[:300]))


def notificar_novo_lead(db: Session, lead, por: User | None = None) -> None:
    """Avisa todos os usuários ativos que entrou um lead novo (site, Meta,
    Followize ou cadastro manual). Quem cadastrou na mão não recebe. Não faz
    commit -- vai junto com a criação do lead (que precisa ter id)."""
    texto = f"Novo lead: {lead.name} — {(lead.origin or '').strip() or 'sem origem'}"
    if (lead.attendant or "").strip():
        texto += f" · atendente {lead.attendant.strip()}"
    ids = [uid for (uid,) in db.query(User.id).filter(User.is_active.is_(True)).all()]
    db.add_all([
        Notificacao(user_id=uid, lead_id=lead.id, texto=texto[:300])
        for uid in ids if not por or uid != por.id
    ])


@router.get("")
def listar_notificacoes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Últimos avisos (30 dias) da pessoa logada + quantos ainda não lidos."""
    desde = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)
    base = db.query(Notificacao).filter(Notificacao.user_id == current_user.id, Notificacao.criado_em >= desde)
    itens = base.order_by(Notificacao.criado_em.desc()).limit(20).all()
    return {
        "nao_lidas": base.filter(Notificacao.lida_em.is_(None)).count(),
        "items": [
            {
                "id": str(n.id),
                "lead_id": str(n.lead_id) if n.lead_id else None,
                "texto": n.texto,
                "criado_em": n.criado_em.isoformat() if n.criado_em else None,
                "lida": n.lida_em is not None,
            }
            for n in itens
        ],
    }


@router.post("/marcar-lidas")
def marcar_lidas(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Abriu o sino = viu tudo."""
    db.query(Notificacao).filter(Notificacao.user_id == current_user.id, Notificacao.lida_em.is_(None)).update(
        {"lida_em": datetime.now(timezone.utc).replace(tzinfo=None)}, synchronize_session=False,
    )
    db.commit()
    return {"success": True}

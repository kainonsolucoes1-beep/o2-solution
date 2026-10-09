from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models import Script, ScriptVersao, User

router = APIRouter(prefix="/api/v1/scripts", tags=["scripts"])


def pode_editar_scripts(user: User) -> bool:
    """Todo mundo vê os scripts. Edita quem não é 'usuario' -- ou um 'usuario'
    liberado em Configurações → Usuários (pode_editar_scripts, ex: Pamela)."""
    return user.role != "usuario" or bool(user.pode_editar_scripts)


def _nome(user: User) -> str:
    return (user.first_name or user.username or "").strip()


def _agora() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


def _exigir_editor(user: User) -> None:
    if not pode_editar_scripts(user):
        raise HTTPException(status_code=403, detail="Seu perfil só pode visualizar os scripts.")


def _get_script(db: Session, script_id: str) -> Script:
    s = db.query(Script).filter(Script.id == script_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Script não encontrado.")
    return s


def _registrar(db: Session, s: Script, acao: str, user: User, detalhe: str | None = None) -> None:
    """Grava a mudança no histórico e no "atualizado por" do script."""
    agora = _agora()
    s.versao = (s.versao or 0) + 1 if acao != "criado" else 1
    s.atualizado_por_id = user.id
    s.atualizado_por_nome = _nome(user)
    s.atualizado_em = agora
    db.add(ScriptVersao(
        script_id=s.id, versao=s.versao, acao=acao, detalhe=detalhe,
        titulo=s.titulo, categoria=s.categoria, conteudo=s.conteudo,
        por_id=user.id, por_nome=_nome(user), em=agora,
    ))


def _script_dict(s: Script) -> dict:
    return {
        "id": str(s.id), "titulo": s.titulo, "categoria": s.categoria, "conteudo": s.conteudo,
        "versao": s.versao, "arquivado": s.arquivado,
        "criado_por": s.criado_por_nome, "criado_em": _iso(s.criado_em),
        "atualizado_por": s.atualizado_por_nome, "atualizado_em": _iso(s.atualizado_em),
    }


class ScriptIn(BaseModel):
    titulo: str = Field(min_length=1, max_length=150)
    categoria: str = Field(min_length=1, max_length=60)
    conteudo: str = Field(min_length=1)


class ScriptEdit(ScriptIn):
    # versão que a pessoa abriu pra editar -- se outra pessoa salvou no meio
    # tempo, recusa em vez de sobrescrever a edição dela sem ninguém ver
    versao: int


def _limpar(body: ScriptIn) -> tuple[str, str, str]:
    titulo, categoria, conteudo = body.titulo.strip(), body.categoria.strip(), body.conteudo.strip()
    if not titulo or not categoria or not conteudo:
        raise HTTPException(status_code=422, detail="Preencha título, categoria e texto.")
    return titulo, categoria, conteudo


def _conferir_versao(s: Script, versao: int) -> None:
    if s.versao != versao:
        quando = s.atualizado_em.isoformat() if s.atualizado_em else ""
        raise HTTPException(
            status_code=409,
            detail={"msg": f"{s.atualizado_por_nome or 'Outra pessoa'} alterou este script enquanto você editava.",
                    "atualizado_por": s.atualizado_por_nome, "atualizado_em": quando},
        )


@router.get("")
def listar_scripts(
    arquivados: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Scripts ativos (ou os arquivados, só pra admin, que pode reativar)."""
    is_admin = current_user.role == "admin"
    if arquivados and not is_admin:
        raise HTTPException(status_code=403, detail="Só admin vê os scripts arquivados.")
    rows = (
        db.query(Script).filter(Script.arquivado.is_(arquivados))
        .order_by(Script.categoria, Script.titulo).all()
    )
    return {
        "pode_editar": pode_editar_scripts(current_user),
        "is_admin": is_admin,
        "scripts": [_script_dict(s) for s in rows],
    }


@router.post("")
def criar_script(body: ScriptIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _exigir_editor(current_user)
    titulo, categoria, conteudo = _limpar(body)
    s = Script(
        titulo=titulo, categoria=categoria, conteudo=conteudo,
        criado_por_id=current_user.id, criado_por_nome=_nome(current_user), criado_em=_agora(),
    )
    db.add(s)
    db.flush()
    _registrar(db, s, "criado", current_user)
    db.commit()
    db.refresh(s)
    return _script_dict(s)


@router.put("/{script_id}")
def editar_script(script_id: str, body: ScriptEdit, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _exigir_editor(current_user)
    s = _get_script(db, script_id)
    if s.arquivado:
        raise HTTPException(status_code=400, detail="Script arquivado não pode ser editado.")
    _conferir_versao(s, body.versao)
    titulo, categoria, conteudo = _limpar(body)
    if (titulo, categoria, conteudo) == (s.titulo, s.categoria, s.conteudo):
        return _script_dict(s)  # nada mudou: não cria versão vazia
    s.titulo, s.categoria, s.conteudo = titulo, categoria, conteudo
    _registrar(db, s, "editado", current_user)
    db.commit()
    db.refresh(s)
    return _script_dict(s)


@router.get("/{script_id}/historico")
def historico_script(script_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Todas as versões (mais recente primeiro) -- visível pra todos."""
    s = _get_script(db, script_id)
    if s.arquivado and current_user.role != "admin":
        raise HTTPException(status_code=404, detail="Script não encontrado.")
    versoes = (
        db.query(ScriptVersao).filter(ScriptVersao.script_id == s.id)
        .order_by(ScriptVersao.versao.desc()).all()
    )
    return [
        {
            "id": str(v.id), "versao": v.versao, "acao": v.acao, "detalhe": v.detalhe,
            "titulo": v.titulo, "categoria": v.categoria, "conteudo": v.conteudo,
            "por": v.por_nome, "em": _iso(v.em),
        }
        for v in versoes
    ]


class RestaurarIn(BaseModel):
    versao_id: str
    versao: int  # versão atual que a pessoa estava vendo


@router.post("/{script_id}/restaurar")
def restaurar_versao(script_id: str, body: RestaurarIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Volta o texto de uma versão antiga -- vira uma versão nova (o histórico
    nunca é reescrito)."""
    _exigir_editor(current_user)
    s = _get_script(db, script_id)
    if s.arquivado:
        raise HTTPException(status_code=400, detail="Script arquivado não pode ser editado.")
    _conferir_versao(s, body.versao)
    v = db.query(ScriptVersao).filter(ScriptVersao.id == body.versao_id, ScriptVersao.script_id == s.id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Versão não encontrada.")
    s.titulo, s.categoria, s.conteudo = v.titulo, v.categoria, v.conteudo
    _registrar(db, s, "restaurado", current_user, detalhe=f"restaurou a versão {v.versao}")
    db.commit()
    db.refresh(s)
    return _script_dict(s)


@router.post("/{script_id}/arquivar")
def arquivar_script(script_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _exigir_editor(current_user)
    s = _get_script(db, script_id)
    if s.arquivado:
        return _script_dict(s)
    s.arquivado = True
    _registrar(db, s, "arquivado", current_user)
    db.commit()
    db.refresh(s)
    return _script_dict(s)


@router.post("/{script_id}/reativar")
def reativar_script(script_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Só admin reativa scripts arquivados.")
    s = _get_script(db, script_id)
    if not s.arquivado:
        return _script_dict(s)
    s.arquivado = False
    _registrar(db, s, "reativado", current_user)
    db.commit()
    db.refresh(s)
    return _script_dict(s)

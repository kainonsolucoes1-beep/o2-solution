import io
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import storage_r2
from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models import Sugestao, SugestaoEvento, SugestaoImagem, User

router = APIRouter(prefix="/api/v1/sugestoes", tags=["sugestoes"])
logger = logging.getLogger(__name__)

STATUS = ("pendente", "andamento", "concluido")
STATUS_LABEL = {"pendente": "Pendente", "andamento": "Em andamento", "concluido": "Concluído"}
MAX_IMAGENS = 5
MAX_IMAGEM_BYTES = 10 * 1024 * 1024
# assinatura dos primeiros bytes -- não confia só no content_type do navegador
_ASSINATURAS = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG\r\n\x1a\n": "image/png"}


def _agora() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _nome(user: User) -> str:
    return (user.first_name or user.username or "").strip()


def _is_admin(user: User) -> bool:
    return user.role == "admin"


def _get(db: Session, sugestao_id: str) -> Sugestao:
    s = db.query(Sugestao).filter(Sugestao.id == sugestao_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sugestão não encontrada.")
    return s


def _pode_editar(s: Sugestao, user: User) -> bool:
    """Autor corrige/complementa enquanto ninguém começou a atuar."""
    return s.autor_id == user.id and s.status == "pendente"


def _evento(db: Session, s: Sugestao, acao: str, user: User, detalhe: str | None = None) -> None:
    db.add(SugestaoEvento(sugestao_id=s.id, acao=acao, detalhe=detalhe, por_nome=_nome(user), em=_agora()))


def _ler_imagens(arquivos: List[UploadFile]) -> list[tuple[str, str, bytes]]:
    """Valida tipo (JPEG/PNG pelos bytes) e tamanho; devolve (nome, tipo, conteúdo)."""
    lidas = []
    for f in arquivos:
        conteudo = f.file.read()
        if not conteudo:
            continue
        tipo = next((t for sig, t in _ASSINATURAS.items() if conteudo.startswith(sig)), None)
        if not tipo:
            raise HTTPException(status_code=422, detail=f"\"{f.filename}\" não é JPEG nem PNG.")
        if len(conteudo) > MAX_IMAGEM_BYTES:
            raise HTTPException(status_code=413, detail=f"\"{f.filename}\" passa de 10 MB.")
        lidas.append((os.path.basename(f.filename or "imagem"), tipo, conteudo))
    return lidas


def _salvar_imagens(db: Session, s: Sugestao, lidas: list[tuple[str, str, bytes]]) -> None:
    for nome, tipo, conteudo in lidas:
        key = f"sugestoes/{s.id}/{uuid.uuid4()}-{nome}"
        storage_r2.upload_file(key, io.BytesIO(conteudo), tipo)
        db.add(SugestaoImagem(sugestao_id=s.id, file_name=nome, content_type=tipo, file_size=len(conteudo), storage_key=key))


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


def _dict(s: Sugestao, imagens: list[SugestaoImagem], eventos: list[SugestaoEvento], user: User) -> dict:
    return {
        "id": str(s.id), "texto": s.texto, "status": s.status,
        "autor": s.autor_nome, "criado_em": _iso(s.criado_em), "editado_em": _iso(s.editado_em),
        "status_em": _iso(s.status_em), "status_por": s.status_por,
        "pode_editar": _pode_editar(s, user),
        "imagens": [
            {
                "id": str(i.id), "nome": i.file_name, "tipo": i.content_type, "tamanho": i.file_size,
                # link temporário, aberto no navegador (miniatura e ampliação)
                "url": storage_r2.presigned_download_url(i.storage_key, i.file_name, expires_in=3600, inline=True),
            }
            for i in imagens
        ],
        "historico": [
            {"acao": e.acao, "detalhe": e.detalhe, "por": e.por_nome, "em": _iso(e.em)}
            for e in eventos
        ],
    }


def _carregar(db: Session, s: Sugestao, user: User) -> dict:
    imgs = db.query(SugestaoImagem).filter(SugestaoImagem.sugestao_id == s.id).order_by(SugestaoImagem.criado_em).all()
    evs = db.query(SugestaoEvento).filter(SugestaoEvento.sugestao_id == s.id).order_by(SugestaoEvento.em).all()
    return _dict(s, imgs, evs, user)


@router.get("")
def listar(status: str = "pendente", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Todos veem todas. Lista um status por vez + a contagem dos três (botões)."""
    if status not in STATUS:
        raise HTTPException(status_code=422, detail="Status inválido.")
    contagem = dict(db.query(Sugestao.status, func.count(Sugestao.id)).group_by(Sugestao.status).all())
    rows = db.query(Sugestao).filter(Sugestao.status == status).order_by(Sugestao.criado_em.desc()).all()
    ids = [s.id for s in rows]
    imgs: dict = {}
    evs: dict = {}
    if ids:
        for i in db.query(SugestaoImagem).filter(SugestaoImagem.sugestao_id.in_(ids)).order_by(SugestaoImagem.criado_em):
            imgs.setdefault(i.sugestao_id, []).append(i)
        for e in db.query(SugestaoEvento).filter(SugestaoEvento.sugestao_id.in_(ids)).order_by(SugestaoEvento.em):
            evs.setdefault(e.sugestao_id, []).append(e)
    return {
        "is_admin": _is_admin(current_user),
        "contagem": {st: contagem.get(st, 0) for st in STATUS},
        "sugestoes": [_dict(s, imgs.get(s.id, []), evs.get(s.id, []), current_user) for s in rows],
    }


@router.post("")
def criar(
    texto: str = Form(...),
    imagens: List[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    texto = texto.strip()
    if not texto:
        raise HTTPException(status_code=422, detail="Escreva a sugestão.")
    if len(imagens) > MAX_IMAGENS:
        raise HTTPException(status_code=422, detail=f"No máximo {MAX_IMAGENS} imagens por sugestão.")
    lidas = _ler_imagens(imagens)  # valida tudo antes de gravar qualquer coisa
    s = Sugestao(texto=texto, status="pendente", autor_id=current_user.id, autor_nome=_nome(current_user), criado_em=_agora())
    db.add(s)
    db.flush()
    _salvar_imagens(db, s, lidas)
    _evento(db, s, "criada", current_user)
    db.commit()
    return _carregar(db, s, current_user)


class EditarIn(BaseModel):
    texto: str


@router.put("/{sugestao_id}")
def editar(sugestao_id: str, body: EditarIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _get(db, sugestao_id)
    if not _pode_editar(s, current_user):
        raise HTTPException(status_code=403, detail="Só quem sugeriu edita, e só enquanto está pendente.")
    texto = body.texto.strip()
    if not texto:
        raise HTTPException(status_code=422, detail="Escreva a sugestão.")
    if texto != s.texto:
        s.texto = texto
        s.editado_em = _agora()
        _evento(db, s, "editada", current_user)
        db.commit()
    return _carregar(db, s, current_user)


@router.post("/{sugestao_id}/imagens")
def adicionar_imagens(
    sugestao_id: str,
    imagens: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = _get(db, sugestao_id)
    if not _pode_editar(s, current_user):
        raise HTTPException(status_code=403, detail="Só quem sugeriu edita, e só enquanto está pendente.")
    atuais = db.query(func.count(SugestaoImagem.id)).filter(SugestaoImagem.sugestao_id == s.id).scalar() or 0
    lidas = _ler_imagens(imagens)
    if atuais + len(lidas) > MAX_IMAGENS:
        raise HTTPException(status_code=422, detail=f"No máximo {MAX_IMAGENS} imagens por sugestão.")
    _salvar_imagens(db, s, lidas)
    s.editado_em = _agora()
    _evento(db, s, "editada", current_user, detalhe=f"adicionou {len(lidas)} imagem(ns)")
    db.commit()
    return _carregar(db, s, current_user)


@router.delete("/{sugestao_id}/imagens/{imagem_id}")
def remover_imagem(sugestao_id: str, imagem_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _get(db, sugestao_id)
    if not _pode_editar(s, current_user):
        raise HTTPException(status_code=403, detail="Só quem sugeriu edita, e só enquanto está pendente.")
    img = db.query(SugestaoImagem).filter(SugestaoImagem.id == imagem_id, SugestaoImagem.sugestao_id == s.id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    key = img.storage_key
    db.delete(img)
    s.editado_em = _agora()
    _evento(db, s, "editada", current_user, detalhe="removeu 1 imagem")
    db.commit()
    try:
        storage_r2.delete_file(key)
    except Exception:  # o registro já saiu; objeto órfão no bucket não quebra nada
        logger.warning("Não foi possível apagar a imagem %s do R2", key)
    return _carregar(db, s, current_user)


class StatusIn(BaseModel):
    status: str


@router.patch("/{sugestao_id}/status")
def mudar_status(sugestao_id: str, body: StatusIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Só admin muda o status das sugestões.")
    if body.status not in STATUS:
        raise HTTPException(status_code=422, detail="Status inválido.")
    s = _get(db, sugestao_id)
    if s.status != body.status:
        _evento(db, s, "status", current_user, detalhe=f"{STATUS_LABEL[s.status]} → {STATUS_LABEL[body.status]}")
        s.status = body.status
        s.status_em = _agora()
        s.status_por = _nome(current_user)
        db.commit()
    return _carregar(db, s, current_user)


@router.delete("/{sugestao_id}", status_code=204)
def excluir(sugestao_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Só admin exclui sugestões.")
    s = _get(db, sugestao_id)
    keys = [k for (k,) in db.query(SugestaoImagem.storage_key).filter(SugestaoImagem.sugestao_id == s.id).all()]
    db.delete(s)  # imagens e histórico saem junto (ON DELETE CASCADE)
    db.commit()
    for k in keys:
        try:
            storage_r2.delete_file(k)
        except Exception:
            logger.warning("Não foi possível apagar a imagem %s do R2", k)

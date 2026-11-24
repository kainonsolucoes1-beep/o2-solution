"""Motivos de perda (sub-status do "Perdido") cadastraveis.

A lista fica no banco (app_settings, chave `motivos_perda`, JSON [{nome, ativo}]) e o
admin edita em Configuracoes > Motivos de perda. Enquanto nao houver lista salva, vale
a padrao abaixo. O lead guarda o texto do motivo (Lead.lost_reason): desativar ou
renomear nao mexe nos leads ja' marcados.
"""
import json

from sqlalchemy.orm import Session

from app.models.app_settings import AppSettings

SETTING_KEY = "motivos_perda"
NOME_MAX = 80
LISTA_MAX = 60

MOTIVOS_PERDA_PADRAO = [
    "Cliente não retornou contato", "Trocou de número", "Declinou", "Finalizado automaticamente",
    "Localização", "Preço", "Sem interesse", "Sem perfil", "Sem retorno",
]


def get_motivos(db: Session) -> list[dict]:
    row = db.query(AppSettings).filter(AppSettings.key == SETTING_KEY).first()
    if row and row.value:
        try:
            lista = json.loads(row.value)
            if isinstance(lista, list) and lista:
                return [{"nome": str(x.get("nome", "")), "ativo": bool(x.get("ativo", True))} for x in lista if isinstance(x, dict)]
        except (ValueError, TypeError, AttributeError):
            pass
    return [{"nome": n, "ativo": True} for n in MOTIVOS_PERDA_PADRAO]


def salvar_motivos(db: Session, motivos: list[dict]) -> None:
    valor = json.dumps(motivos, ensure_ascii=False)
    row = db.query(AppSettings).filter(AppSettings.key == SETTING_KEY).first()
    if row:
        row.value = valor
    else:
        db.add(AppSettings(key=SETTING_KEY, value=valor))
    db.commit()

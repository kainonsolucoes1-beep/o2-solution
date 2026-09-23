"""Operadoras de saude aceitas no envio de um lead pra emissao de contrato.

A lista fica no banco (app_settings, chave `operadoras_emissao`, JSON) e o admin edita
em Configuracoes > Operadoras. Enquanto nao houver lista salva, vale a padrao abaixo.
Renomear/remover uma operadora nao mexe nos envios ja' registrados (guardam o nome).
"""
import json

from sqlalchemy.orm import Session

from app.models.app_settings import AppSettings

SETTING_KEY = "operadoras_emissao"
NOME_MAX = 60           # tamanho da coluna lead_emissoes.operadora
LISTA_MAX = 80
RESERVADO = "Sem operadora"   # rotulo do indicador pra envio sem operadora definida

OPERADORAS_EMISSAO_PADRAO = [
    "Amil", "Bradesco", "SulAmérica", "Porto", "Hapvida", "NotreDame", "Transmontano",
    "BioVida", "Alice", "Omint", "CarePlus", "Unimed", "Única Saúde", "MedSenior", "PreventSenior",
]


def get_operadoras(db: Session) -> list[str]:
    row = db.query(AppSettings).filter(AppSettings.key == SETTING_KEY).first()
    if row and row.value:
        try:
            lista = json.loads(row.value)
            if isinstance(lista, list) and lista:
                return [str(x) for x in lista]
        except (ValueError, TypeError):
            pass
    return list(OPERADORAS_EMISSAO_PADRAO)


def normalizar(nomes: list[str]) -> list[str]:
    """Tira espacos, descarta vazios e repetidos (sem diferenciar maiuscula), mantem a ordem."""
    vistos: set[str] = set()
    out: list[str] = []
    for n in nomes:
        n = (n or "").strip()
        if n and n.lower() not in vistos:
            vistos.add(n.lower())
            out.append(n)
    return out


def salvar_operadoras(db: Session, nomes: list[str]) -> None:
    valor = json.dumps(nomes, ensure_ascii=False)
    row = db.query(AppSettings).filter(AppSettings.key == SETTING_KEY).first()
    if row:
        row.value = valor
    else:
        db.add(AppSettings(key=SETTING_KEY, value=valor))
    db.commit()

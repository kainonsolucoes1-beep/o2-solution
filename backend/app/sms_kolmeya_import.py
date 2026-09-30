"""Leitura das planilhas exportadas da Kolmeya (disparo de SMS em massa):
envio (TELEFONE;NOME), retorno (job;phone;status;name;mensagem;criacao) e
resposta (job;telefone;nome;resposta;recebimento;resolvida)."""
from datetime import datetime
from typing import Optional

from app.renutricao_import import _read_rows, _normalize_header, _cell_to_text
from app.tz_utils import BR_OFFSET


def _read_table(filename: str, content: bytes) -> tuple[list[str], list[list]]:
    try:
        rows = _read_rows(filename, content)
    except Exception:
        raise ValueError(f"Não foi possível ler o arquivo {filename or ''}".strip())
    if not rows:
        raise ValueError(f"O arquivo {filename or ''} está vazio".strip())
    return [_normalize_header(h) for h in rows[0]], rows[1:]


def _col(headers: list[str], names: tuple[str, ...], label: str, filename: str) -> int:
    for i, h in enumerate(headers):
        if h in names:
            return i
    raise ValueError(f"{filename}: coluna '{label}' não encontrada")


def _cell(row: list, idx: int) -> str:
    return _cell_to_text(row[idx]) if idx < len(row) else ""


def _parse_criacao(value) -> Optional[datetime]:
    """'criacao' do retorno vem em horário de Brasília -> UTC naive (padrão do banco)."""
    if isinstance(value, datetime):
        return value + BR_OFFSET
    text = _cell_to_text(value)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M"):
        try:
            return datetime.strptime(text, fmt) + BR_OFFSET
        except ValueError:
            continue
    return None


def parse_envio(filename: str, content: bytes) -> int:
    """Quantidade de linhas com telefone na planilha de envio."""
    headers, rows = _read_table(filename, content)
    tel = _col(headers, ("telefone", "phone", "celular"), "TELEFONE", filename)
    return sum(1 for r in rows if _cell(r, tel))


def parse_retorno(filename: str, content: bytes) -> dict:
    """Um job por planilha: total de linhas, entregues e data do disparo."""
    headers, rows = _read_table(filename, content)
    job_i = _col(headers, ("job",), "job", filename)
    status_i = _col(headers, ("status",), "status", filename)
    criacao_i = next((i for i, h in enumerate(headers) if h in ("criacao", "data")), None)

    rows = [r for r in rows if _cell(r, job_i)]
    jobs = {_cell(r, job_i) for r in rows}
    if not jobs:
        raise ValueError(f"{filename}: nenhuma linha com job")
    if len(jobs) > 1:
        raise ValueError(f"{filename}: tem mais de um job ({', '.join(sorted(jobs))}) — importe um disparo por vez")

    datas = [d for d in (_parse_criacao(r[criacao_i]) for r in rows if criacao_i is not None and criacao_i < len(r)) if d]
    return {
        "job": jobs.pop(),
        "retornos": len(rows),
        "entregues": sum(1 for r in rows if _normalize_header(_cell(r, status_i)) == "entregue"),
        "data_disparo": min(datas) if datas else None,
    }


def parse_resposta(filename: str, content: bytes) -> list[dict]:
    """Uma linha por resposta. Positivo = coluna 'resposta' (D) igual a "Sim"."""
    headers, rows = _read_table(filename, content)
    job_i = _col(headers, ("job",), "job", filename)
    tel_i = _col(headers, ("telefone", "phone"), "telefone", filename)
    resp_i = next((i for i, h in enumerate(headers) if h == "resposta"), 3)
    nome_i = next((i for i, h in enumerate(headers) if h in ("nome", "name")), None)
    receb_i = next((i for i, h in enumerate(headers) if h in ("recebimento", "recebido", "data")), None)

    out = []
    for r in rows:
        job, tel = _cell(r, job_i), _cell(r, tel_i)
        if not job or not tel:
            continue
        resposta = _cell(r, resp_i).strip('"').strip()
        out.append({
            "job": job,
            "telefone": tel,
            "nome": _cell(r, nome_i) if nome_i is not None else None,
            "resposta": resposta,
            "recebido_em": _cell(r, receb_i)[:30] if receb_i is not None else "",
            "positivo": _normalize_header(resposta) == "sim",
        })
    return out

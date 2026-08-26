from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from werkzeug.security import generate_password_hash, check_password_hash
import os
import secrets
import string

SECRET_KEY = os.getenv("SECRET_KEY", "sua-chave-super-secreta-123456")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 480))

def hash_password(password: str) -> str:
    return generate_password_hash(password, method="pbkdf2:sha256")

def generate_temp_password(length: int = 10) -> str:
    """Senha temporária aleatória pra usuário recém-criado — substitui uma
    senha padrão fixa (ex: '123456'), que ficaria valendo igual pra todo
    mundo até o primeiro login."""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return check_password_hash(hashed_password, plain_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

FINANCIAL_ROLES = ("admin", "diretor", "financeiro", "coordenador")


def can_see_financials(user) -> bool:
    """Receita real (recebida/a receber) e dado confidencial: so admin, diretor,
    financeiro e coordenador veem."""
    return user.role in FINANCIAL_ROLES


RESTRICTED_LEAD_ROLES = ("admin", "diretor", "financeiro", "coordenador")


def can_see_restricted_leads(user) -> bool:
    """Leads marcados com visibility_tag='ADM' so aparecem (em qualquer tela,
    relatorio ou agregado) para quem tem um desses perfis. Supervisor
    deliberadamente de fora -- so diretor/financeiro/coordenador/admin veem."""
    return user.role in RESTRICTED_LEAD_ROLES


TEAM_SCOPED_ROLES = ("supervisor",)


def team_scope(user) -> str | None:
    """Perfis com visao restrita a propria equipe (ex: supervisor) so veem
    leads com Lead.team igual ao team cadastrado no proprio usuario.
    Retorna None quando nao ha restricao de equipe a aplicar."""
    if user.role in TEAM_SCOPED_ROLES and user.team:
        return user.team
    return None


COMERCIAL_ROLES = ("comercial",)


def restrict_to_usuario_leads(user) -> bool:
    """Perfil comercial so ve leads pertencentes a contas com role='usuario'
    (gestao da equipe padrao)."""
    return user.role in COMERCIAL_ROLES


def needs_own_origin_filter(user) -> bool:
    """Usuario comum so' enxerga os proprios leads (Lead.origin == nome dele).
    Admin nao tem essa restricao. Comercial tambem nao -- a visibilidade dele
    ja e' restrita pelo filtro global de sessao (restrict_to_usuario_leads,
    database.py), e somar os dois filtros zerava a lista pra sempre (o nome
    do comercial nunca bate com o Lead.origin dos leads da equipe que ele
    supervisiona, que pertencem a outras contas)."""
    return user.role != "admin" and user.role not in COMERCIAL_ROLES


def verify_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        return user_id
    except JWTError:
        return None
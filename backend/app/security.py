from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from werkzeug.security import generate_password_hash, check_password_hash
import os

SECRET_KEY = os.getenv("SECRET_KEY", "sua-chave-super-secreta-123456")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 480))

def hash_password(password: str) -> str:
    return generate_password_hash(password, method="pbkdf2:sha256")

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

FINANCIAL_ROLES = ("admin", "diretor")


def can_see_financials(user) -> bool:
    """Receita real (recebida/a receber) e dado confidencial: so admin e diretor veem."""
    return user.role in FINANCIAL_ROLES


RESTRICTED_LEAD_ROLES = ("admin", "diretor", "financeiro", "supervisor")


def can_see_restricted_leads(user) -> bool:
    """Leads marcados com visibility_tag='ADM' so aparecem (em qualquer tela,
    relatorio ou agregado) para quem tem um desses perfis."""
    return user.role in RESTRICTED_LEAD_ROLES


def verify_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        return user_id
    except JWTError:
        return None
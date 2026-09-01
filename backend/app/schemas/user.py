from uuid import UUID
from pydantic import BaseModel, EmailStr, computed_field
from typing import Optional
from datetime import datetime, date

class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str
    first_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool = False

class UserResponse(BaseModel):
    id: UUID
    email: str
    username: str
    first_name: Optional[str]
    role: str = "usuario"
    created_at: datetime
    must_change_password: bool = False

    class Config:
        from_attributes = True


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class OperatorInfo(BaseModel):
    id: UUID
    name: str


class UserAdminCreate(BaseModel):
    email: EmailStr
    username: str
    first_name: Optional[str] = None
    role: str = "usuario"
    team: Optional[str] = None
    birth_date: Optional[date] = None
    phone: Optional[str] = None
    cpf: Optional[str] = None
    hire_date: Optional[date] = None


class UserAdminUpdate(BaseModel):
    role: Optional[str] = None
    team: Optional[str] = None
    is_active: Optional[bool] = None
    first_name: Optional[str] = None
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    password: Optional[str] = None
    birth_date: Optional[date] = None
    phone: Optional[str] = None
    cpf: Optional[str] = None
    hire_date: Optional[date] = None
    termination_date: Optional[date] = None
    horario_estendido: Optional[bool] = None
    acesso_externo_liberado: Optional[bool] = None


class UserAdminResponse(BaseModel):
    id: UUID
    email: str
    username: str
    first_name: Optional[str]
    role: str
    team: Optional[str]
    is_active: bool
    must_change_password: bool
    created_at: datetime
    birth_date: Optional[date]
    phone: Optional[str]
    cpf: Optional[str]
    hire_date: Optional[date]
    termination_date: Optional[date]
    horario_estendido: bool = False
    acesso_externo_liberado: bool = False

    class Config:
        from_attributes = True

    @computed_field
    @property
    def idade(self) -> Optional[int]:
        if not self.birth_date:
            return None
        today = date.today()
        anos = today.year - self.birth_date.year
        if (today.month, today.day) < (self.birth_date.month, self.birth_date.day):
            anos -= 1
        return anos


class UserAdminCreateResponse(UserAdminResponse):
    temp_password: str

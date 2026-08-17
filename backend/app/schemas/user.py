from uuid import UUID
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

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


class UserAdminUpdate(BaseModel):
    role: Optional[str] = None
    team: Optional[str] = None
    is_active: Optional[bool] = None
    first_name: Optional[str] = None
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    password: Optional[str] = None


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

    class Config:
        from_attributes = True


class UserAdminCreateResponse(UserAdminResponse):
    temp_password: str

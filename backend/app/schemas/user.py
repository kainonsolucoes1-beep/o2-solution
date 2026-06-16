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

class UserResponse(BaseModel):
    id: UUID
    email: str
    username: str
    first_name: Optional[str]
    role: str = "user"
    created_at: datetime

    class Config:
        from_attributes = True


class OperatorInfo(BaseModel):
    id: UUID
    name: str

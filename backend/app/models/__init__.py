from app.models.user import User
from app.models.lead import Lead, LeadNote, LeadStatusHistory, LeadSchedule, LeadParcela, LeadAttachment, CampanhaEvento, CampanhaTemplate, LeadEmissao
from app.models.campanha_sms import CampanhaSmsLote, CampanhaSmsResposta
from app.models.notificacao import Notificacao
from app.models.app_settings import AppSettings
from app.models.form_user import FormUser
from app.models.telefonia_daily import TelefoniaDaily
from app.models.sdr_meta import SdrMeta, SdrMetaMensal
from app.models.login_event import LoginEvent
from app.models.trusted_device import TrustedDevice
from app.models.script import Script, ScriptVersao

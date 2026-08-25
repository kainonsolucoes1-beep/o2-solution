import re

BASE_ALIASES: dict[str, str] = {
    "empresas até 9 colaboradores":                    "Empresas SP capital LTDA - Até 9 colaboradores",
    "discadora – empresas sp até 9 colaboradores":     "Empresas SP capital LTDA - Até 9 colaboradores",
    "discadora - empresas sp até 9 colaboradores":     "Empresas SP capital LTDA - Até 9 colaboradores",
    "empresas sp até 9 colaboradores":                 "Empresas SP capital LTDA - Até 9 colaboradores",
    "empresas sp — até 9 colaboradores":               "Empresas SP capital LTDA - Até 9 colaboradores",
    "empresas sp - até 9 colaboradores":               "Empresas SP capital LTDA - Até 9 colaboradores",
    "não informado":                                   "Empresas SP capital LTDA - Até 9 colaboradores",
    "empresas em sp ltda - ate 9 colaboradores":       "Empresas SP capital LTDA - Até 9 colaboradores",
    "ate 9 colaboradores":                             "Empresas SP capital LTDA - Até 9 colaboradores",
    "mei sp (discadora)":                              "Clientes MEI em SP",
    "clientes mei em sp":                              "Clientes MEI em SP",
    "mei em sp":                                        "Clientes MEI em SP",
    "discadora sul américa":                           "SulAmerica",
    "discadora sul america":                           "SulAmerica",
    "base sulamerica":                                 "SulAmerica",
}
_BASE_RE_EMOJI  = re.compile(r'🗂️\s*Base:\s*([^|\n]+)')
_BASE_RE_SIMPLE = re.compile(r'(?im)^Base:\s*([^\n]+)')
# remove sufixo de data (ex: "- 23/07", "– 23/07/2026") que algumas cargas
# anexam ao nome da base, senao cada dia vira um grupo separado na listagem.
_BASE_DATE_SUFFIX_RE = re.compile(r'\s*[-–]\s*\d{1,2}/\d{1,2}(?:/\d{2,4})?\s*$')


def extract_base(notes: str | None) -> str | None:
    text = notes or ''
    m = _BASE_RE_EMOJI.search(text) or _BASE_RE_SIMPLE.search(text)
    if not m:
        return None
    base = m.group(1).strip()
    if not base:
        return None
    base = _BASE_DATE_SUFFIX_RE.sub('', base).strip() or base
    return BASE_ALIASES.get(base.lower(), base)


ORGANICO_EXTRA = {'site', 'chatgpt.com', 'chatgpt', 'google', 'instagram', 'facebook', 'whatsapp'}


def is_organico(origin: str | None, conversion_point: str | None = None) -> bool:
    if (conversion_point or '').strip().lower() == 'chatgpt.com':
        return True
    o = (origin or '').lower()
    return 'org' in o or o in ORGANICO_EXTRA

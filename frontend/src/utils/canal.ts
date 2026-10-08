// Classificação da Origem do lead em grupo de captação -- espelha
// backend/app/lead_utils.py (is_organico / is_google). Google tem grupo
// próprio nas contagens, mas não é SDR.
const ORGANICO_EXTRA = new Set(['site', 'chatgpt.com', 'chatgpt', 'google', 'instagram', 'facebook', 'whatsapp', 'meta ads'])

export const isOrganico = (o: string) => o.toLowerCase().includes('org') || ORGANICO_EXTRA.has(o.toLowerCase())
export const isGoogle   = (o: string) => o.trim().toLowerCase() === 'google'

export type GrupoCanal = 'SDR' | 'Orgânico' | 'Google'
export const grupoCanal = (o: string): GrupoCanal => isGoogle(o) ? 'Google' : isOrganico(o) ? 'Orgânico' : 'SDR'

export const GOOGLE_COLOR = '#8B5CF6'

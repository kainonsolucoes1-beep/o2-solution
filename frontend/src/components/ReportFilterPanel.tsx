import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Calendar, Filter, Users, Target, ClipboardList, RotateCcw, Search, ChevronDown, Flame, PanelLeftClose } from 'lucide-react'
import { personColor } from '../utils/reportColors'

// Painel lateral de filtros do Relatório de Leads: seções que abrem e fecham,
// multi-seleção e, ao lado de cada opção, quantos leads ela traria
// (contagens de /leads/report-facets).

export interface ReportFacets {
  status?: Record<string, number>
  perception?: Record<string, number>
  canal?: Record<string, number>
  team?: Record<string, number>
  lost_reason?: Record<string, number>
  modalidade?: Record<string, number>
  conversion_point?: Record<string, number>
  campanha?: Record<string, number>
  operador?: Record<string, number>
  vidas?: Record<string, number>
  faixa_etaria?: Record<string, number>
  renutricao?: { em: number; fora: number }
}

export interface FilterValues {
  dateFrom: string
  dateTo: string
  status: string
  closedSubStatus: string
  lostReason: string
  perception: string
  origem: string
  team: string
  canal: string
  conversionPoint: string
  campanha: string
  modalidade: string
  vidas: string
  faixa: string
  renut: '' | 'em' | 'fora'
}

export interface StatusOption { value: string; label: string; color: string }
export interface DatePreset { key: string; label: string; from: string; to: string }

interface Props {
  value: FilterValues
  onChange: (patch: Partial<FilterValues>) => void
  facets: ReportFacets | null
  statusOptions: StatusOption[]
  closedOptions: { value: string; label: string }[]
  statusFechado: string
  statusPerdido: string
  datePresets: DatePreset[]
  operators: string[]
  canais: string[]
  sitePoints: string[]
  campanhas: string[]
  modalidades: string[]
  lostReasons: string[]
  teamOptions: { label: string; value: string }[]
  vidasOptions: { value: string; label: string }[]
  faixaOptions: { value: string; label: string }[]
  canFilterOperador: boolean
  canViewAll: boolean
  myName: string
  activeCount: number
  onClearAll: () => void
  onCollapse: () => void
}

const SECTIONS_KEY = 'leadsReportPanelSections'
const DEFAULT_CLOSED = ['origem', 'perfil']

export const csvSet = (csv: string) => new Set(csv.split(',').map(s => s.trim()).filter(Boolean))
function toggleIn(csv: string, v: string) {
  const s = csvSet(csv)
  if (s.has(v)) s.delete(v)
  else s.add(v)
  return [...s].join(',')
}

const SUB: CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '12px 0 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }

export default function ReportFilterPanel(p: Props) {
  const { value: v, onChange, facets } = p
  const [closed, setClosed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(SECTIONS_KEY)
      return new Set(raw ? JSON.parse(raw) : DEFAULT_CLOSED)
    } catch { return new Set(DEFAULT_CLOSED) }
  })
  useEffect(() => {
    try { localStorage.setItem(SECTIONS_KEY, JSON.stringify([...closed])) } catch { /* sem storage */ }
  }, [closed])
  const toggleSec = (k: string) => setClosed(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const [opSearch, setOpSearch] = useState('')

  const statusSel = useMemo(() => csvSet(v.status), [v.status])
  const statusGroupsOn = p.statusOptions.filter(o => statusSel.has(o.value.split(',')[0]))
  const statusCount = (o: StatusOption) => facets?.status ? o.value.split(',').reduce((a, k) => a + (facets.status![k.trim().toLowerCase()] ?? 0), 0) : undefined
  function toggleStatus(o: StatusOption) {
    const on = new Set(statusGroupsOn.map(g => g.value))
    if (on.has(o.value)) on.delete(o.value)
    else on.add(o.value)
    onChange({ status: p.statusOptions.filter(g => on.has(g.value)).map(g => g.value).join(',') })
  }

  const preset = p.datePresets.find(d => d.from === v.dateFrom && d.to === v.dateTo)
  const nStatus = statusGroupsOn.length + (v.closedSubStatus ? 1 : 0) + csvSet(v.lostReason).size
  const nResp = csvSet(v.origem).size + csvSet(v.team).size
  const nOrig = csvSet(v.canal).size + csvSet(v.conversionPoint).size + csvSet(v.campanha).size
  const nPerfil = csvSet(v.modalidade).size + csvSet(v.vidas).size + csvSet(v.faixa).size

  const opItems = p.operators
    .filter(o => !opSearch || o.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(opSearch.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')))
    .map(o => ({ value: o, label: o, count: facets?.operador ? facets.operador[o] ?? 0 : undefined }))

  return (
    <aside style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
      display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 'calc(100vh - 32px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 14px 13px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <Filter size={15} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Filtros</span>
        {p.activeCount > 0 && (
          <button onClick={p.onClearAll} style={{ ...linkBtn, marginLeft: 'auto' }}>Limpar ({p.activeCount})</button>
        )}
        <button onClick={p.onCollapse} title="Recolher filtros" aria-label="Recolher filtros" style={{ ...iconBtn, marginLeft: p.activeCount > 0 ? 4 : 'auto' }}>
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div style={{ overflowY: 'auto', overflowX: 'hidden', minHeight: 0, scrollbarWidth: 'thin' }}>
        <Section k="periodo" icon={<Calendar size={14} />} title="Período" badge={preset ? preset.label : 'Personalizado'} closed={closed} onToggle={toggleSec}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {p.datePresets.map(d => (
              <SegBtn key={d.key} on={preset?.key === d.key} onClick={() => onChange({ dateFrom: d.from, dateTo: d.to })}>{d.label}</SegBtn>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6, marginTop: 9 }}>
            <DateField label="De" value={v.dateFrom} onChange={x => onChange({ dateFrom: x })} />
            <DateField label="Até" value={v.dateTo} onChange={x => onChange({ dateTo: x })} />
          </div>
        </Section>

        <Section k="status" icon={<Filter size={14} />} title="Status" badge={nStatus || ''} closed={closed} onToggle={toggleSec}>
          <OptionList
            items={p.statusOptions.map(o => ({ value: o.value, label: o.label, color: o.color, count: statusCount(o) }))}
            isOn={x => statusSel.has(x.split(',')[0])}
            onToggle={x => toggleStatus(p.statusOptions.find(o => o.value === x)!)}
            max={statusGroupsOn.length ? 99 : 6}
            moreLabel={n => `+ ${n} status`}
          />
          {v.status === p.statusFechado && (
            <>
              <div style={SUB}>Etapa</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                <SegBtn on={!v.closedSubStatus} onClick={() => onChange({ closedSubStatus: '' })}>Todas</SegBtn>
                {p.closedOptions.map(o => (
                  <SegBtn key={o.value} on={v.closedSubStatus === o.value} onClick={() => onChange({ closedSubStatus: o.value })}>{o.label}</SegBtn>
                ))}
              </div>
            </>
          )}
          {v.status === p.statusPerdido && p.lostReasons.length > 0 && (
            <>
              <div style={SUB}>Motivo da perda</div>
              <OptionList
                items={p.lostReasons.map(r => ({ value: r, label: r, count: facets?.lost_reason ? facets.lost_reason[r] ?? 0 : undefined }))}
                isOn={x => csvSet(v.lostReason).has(x)}
                onToggle={x => onChange({ lostReason: toggleIn(v.lostReason, x) })}
                sortByCount max={5}
              />
            </>
          )}
        </Section>

        <Section k="temp" icon={<Flame size={14} />} title="Temperatura" badge={csvSet(v.perception).size || ''} closed={closed} onToggle={toggleSec}>
          <OptionList
            items={[
              { value: 'Quente', label: 'Quente', color: 'var(--lr-quente)' },
              { value: 'Morno', label: 'Morno', color: 'var(--lr-morno)' },
              { value: 'Frio', label: 'Frio', color: 'var(--lr-frio)' },
            ].map(o => ({ ...o, count: facets?.perception ? facets.perception[o.value] ?? 0 : undefined }))}
            isOn={x => csvSet(v.perception).has(x)}
            onToggle={x => onChange({ perception: toggleIn(v.perception, x) })}
          />
        </Section>

        <Section k="resp" icon={<Users size={14} />} title="Responsável" badge={nResp || ''} closed={closed} onToggle={toggleSec}>
          <div style={{ ...SUB, marginTop: 2 }}>Operador</div>
          {p.canFilterOperador ? (
            <>
              {p.operators.length > 8 && (
                <label style={miniSearch}>
                  <Search size={12} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
                  <input value={opSearch} onChange={e => setOpSearch(e.target.value)} placeholder="Buscar operador…" style={miniInput} />
                </label>
              )}
              <OptionList
                items={opItems}
                isOn={x => csvSet(v.origem).has(x)}
                onToggle={x => onChange({ origem: toggleIn(v.origem, x) })}
                sortByCount max={opSearch ? 99 : 6} avatar
                empty="Nenhum operador"
              />
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '4px 0' }}>{p.myName}</div>
          )}
          {p.canViewAll && (
            <>
              <div style={SUB}>Equipe</div>
              <OptionList
                items={p.teamOptions.map(t => ({ value: t.value, label: t.label, count: facets?.team ? facets.team[t.value] ?? 0 : undefined }))}
                isOn={x => csvSet(v.team).has(x)}
                onToggle={x => onChange({ team: toggleIn(v.team, x) })}
              />
            </>
          )}
        </Section>

        <Section k="origem" icon={<Target size={14} />} title="Origem e campanha" badge={nOrig || ''} closed={closed} onToggle={toggleSec}>
          <div style={{ ...SUB, marginTop: 2 }}>Origem</div>
          <OptionList
            items={withSelected(p.canais, v.canal).map(c => ({ value: c, label: c, count: facets?.canal ? facets.canal[c] ?? 0 : undefined }))}
            isOn={x => csvSet(v.canal).has(x)}
            onToggle={x => onChange({ canal: toggleIn(v.canal, x) })}
            sortByCount max={6}
          />
          <div style={SUB}>Ponto de conversão</div>
          <OptionList
            items={withSelected(p.sitePoints, v.conversionPoint).map(c => ({ value: c, label: c, count: facets?.conversion_point ? facets.conversion_point[c.toLowerCase()] ?? 0 : undefined }))}
            isOn={x => csvSet(v.conversionPoint).has(x)}
            onToggle={x => onChange({ conversionPoint: toggleIn(v.conversionPoint, x) })}
            sortByCount max={5} empty="Nenhum ponto de conversão"
          />
          <div style={SUB}>Campanha</div>
          <OptionList
            items={withSelected(['Sem campanha', ...p.campanhas], v.campanha).map(c => ({ value: c, label: c, count: facets?.campanha ? facets.campanha[c.toLowerCase()] ?? 0 : undefined }))}
            isOn={x => csvSet(v.campanha).has(x)}
            onToggle={x => onChange({ campanha: toggleIn(v.campanha, x) })}
            sortByCount max={5}
          />
        </Section>

        <Section k="perfil" icon={<ClipboardList size={14} />} title="Perfil do lead" badge={nPerfil || ''} closed={closed} onToggle={toggleSec}>
          <div style={{ ...SUB, marginTop: 2 }}>Modalidade</div>
          <OptionList
            items={withSelected(p.modalidades, v.modalidade).map(m => ({ value: m, label: m, count: facets?.modalidade ? facets.modalidade[m] ?? 0 : undefined }))}
            isOn={x => csvSet(v.modalidade).has(x)}
            onToggle={x => onChange({ modalidade: toggleIn(v.modalidade, x) })}
          />
          <div style={SUB}>Vidas</div>
          <PillGroup
            items={p.vidasOptions.map(o => ({ ...o, label: o.value === 'sem' ? 'Não inf.' : o.label, count: facets?.vidas?.[o.value] }))}
            isOn={x => csvSet(v.vidas).has(x)}
            onToggle={x => onChange({ vidas: toggleIn(v.vidas, x) })}
          />
          <div style={SUB}>Faixa etária <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>alguém da proposta</span></div>
          <PillGroup
            items={p.faixaOptions.map(o => ({ ...o, label: o.value === 'sem' ? 'Não inf.' : o.label, count: facets?.faixa_etaria?.[o.value] }))}
            isOn={x => csvSet(v.faixa).has(x)}
            onToggle={x => onChange({ faixa: toggleIn(v.faixa, x) })}
          />
        </Section>

        <Section k="renut" icon={<RotateCcw size={14} />} title="Renutrição" badge={v.renut === 'em' ? 'Em' : v.renut === 'fora' ? 'Fora' : ''} closed={closed} onToggle={toggleSec} last>
          <div style={{ display: 'flex', background: 'var(--bg-subtle)', borderRadius: 9, padding: 3 }}>
            {([
              ['', 'Todos', undefined],
              ['em', 'Em renutrição', facets?.renutricao?.em],
              ['fora', 'Fora', facets?.renutricao?.fora],
            ] as const).map(([val, lbl, n]) => {
              const on = v.renut === val
              return (
                <button key={lbl} onClick={() => onChange({ renut: val })} style={{
                  flex: 1, padding: '6px 4px', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap',
                  background: on ? 'var(--bg-card)' : 'transparent', color: on ? 'var(--text-1)' : 'var(--text-muted)',
                  boxShadow: on ? '0 1px 3px rgba(15,23,42,0.14)' : 'none',
                }}>
                  {lbl}{n != null && <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}> · {n}</span>}
                </button>
              )
            })}
          </div>
        </Section>
      </div>
    </aside>
  )
}

// valores escolhidos que não estão mais na lista (ex.: vindo de um link) continuam aparecendo
function withSelected(list: string[], csv: string) {
  const extra = [...csvSet(csv)].filter(x => !list.includes(x))
  return [...list, ...extra]
}

function Section({ k, icon, title, badge, closed, onToggle, children, last }: {
  k: string; icon: ReactNode; title: string; badge: string | number; closed: Set<string>; onToggle: (k: string) => void; children: ReactNode; last?: boolean
}) {
  const isClosed = closed.has(k)
  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid var(--border-lt)' }}>
      <button
        onClick={() => onToggle(k)}
        aria-expanded={!isClosed}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', border: 'none', background: 'none',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', textAlign: 'left',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <span style={{ color: 'var(--accent)', display: 'flex' }}>{icon}</span>
        {title}
        {badge !== '' && badge !== 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: 'var(--accent-weak)', color: 'var(--accent-strong, var(--accent))' }}>{badge}</span>
        )}
        <ChevronDown size={14} style={{ marginLeft: badge !== '' && badge !== 0 ? 4 : 'auto', color: 'var(--text-subtle)', transform: isClosed ? 'rotate(-90deg)' : 'none', transition: 'transform 150ms' }} />
      </button>
      {!isClosed && <div style={{ padding: '0 16px 14px' }}>{children}</div>}
    </div>
  )
}

interface Item { value: string; label: string; count?: number; color?: string }

function OptionList({ items, isOn, onToggle, max = 99, sortByCount, avatar, empty, moreLabel }: {
  items: Item[]; isOn: (v: string) => boolean; onToggle: (v: string) => void; max?: number; sortByCount?: boolean; avatar?: boolean; empty?: string; moreLabel?: (n: number) => string
}) {
  const [all, setAll] = useState(false)
  const sorted = sortByCount
    ? [...items].sort((a, b) => Number(isOn(b.value)) - Number(isOn(a.value)) || (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label, 'pt-BR'))
    : items
  const shown = all ? sorted : sorted.slice(0, Math.max(max, sorted.filter(i => isOn(i.value)).length))
  const hidden = sorted.length - shown.length
  if (!items.length) return <div style={{ fontSize: 12, color: 'var(--text-subtle)', padding: '2px 0' }}>{empty ?? 'Nenhuma opção'}</div>
  return (
    <div>
      {shown.map(it => {
        const on = isOn(it.value)
        const zero = it.count === 0 && !on
        return (
          <button
            key={it.value}
            onClick={() => onToggle(it.value)}
            role="checkbox" aria-checked={on}
            style={{
              width: 'calc(100% + 12px)', margin: '0 -6px', display: 'flex', alignItems: 'center', gap: 9, padding: '5px 6px',
              border: 'none', background: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              fontSize: 13, color: on ? 'var(--text-1)' : 'var(--text-3b)', fontWeight: on ? 500 : 400, opacity: zero ? 0.5 : 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <span style={{
              width: 15, height: 15, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-in)'}`, background: on ? 'var(--accent)' : 'var(--bg-input)',
              transition: 'all 100ms',
            }}>
              {on && <svg width="9" height="9" viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" style={{ stroke: 'var(--accent-contrast, #fff)' }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </span>
            {it.color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: it.color, flexShrink: 0 }} />}
            {avatar && (
              <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', background: personColor(it.label) }}>
                {it.label.trim()[0]?.toUpperCase()}
              </span>
            )}
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.label}>{it.label}</span>
            {it.count != null && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums', fontWeight: 400 }}>{it.count}</span>}
          </button>
        )
      })}
      {(hidden > 0 || all) && sorted.length > max && (
        <button onClick={() => setAll(a => !a)} style={{ ...linkBtn, padding: '5px 0 0' }}>
          {all ? 'Mostrar menos' : moreLabel ? moreLabel(hidden) : `Ver mais ${hidden}`}
        </button>
      )}
    </div>
  )
}

function PillGroup({ items, isOn, onToggle }: { items: Item[]; isOn: (v: string) => boolean; onToggle: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {items.map(it => (
        <SegBtn key={it.value} on={isOn(it.value)} onClick={() => onToggle(it.value)} dim={it.count === 0}>
          {it.label}
          {it.count != null && <span style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.7, marginLeft: 4 }}>{it.count}</span>}
        </SegBtn>
      ))}
    </div>
  )
}

function SegBtn({ on, onClick, children, dim }: { on: boolean; onClick: () => void; children: ReactNode; dim?: boolean }) {
  return (
    <button onClick={onClick} style={{
      height: 28, padding: '0 9px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
      fontSize: 12, fontWeight: on ? 600 : 500, display: 'inline-flex', alignItems: 'center',
      border: `1px solid ${on ? 'var(--accent-line, var(--accent))' : 'var(--border)'}`,
      background: on ? 'var(--accent-weak)' : 'var(--bg-card)', color: on ? 'var(--accent-strong, var(--accent))' : 'var(--text-3b)',
      opacity: dim && !on ? 0.5 : 1, transition: 'all 120ms',
    }}>
      {children}
    </button>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--text-subtle)', marginBottom: 3 }}>{label}</span>
      <input
        type="date" value={value} onChange={e => e.target.value && onChange(e.target.value)}
        style={{ width: '100%', minWidth: 0, height: 32, padding: '0 5px', borderRadius: 8, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: 12, fontFamily: 'inherit' }}
      />
    </label>
  )
}

const linkBtn: CSSProperties = { border: 'none', background: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }
const iconBtn: CSSProperties = { width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const miniSearch: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 9px', border: '1px solid var(--border-in)', borderRadius: 8, marginBottom: 6, background: 'var(--bg-input)' }
const miniInput: CSSProperties = { border: 'none', outline: 'none', background: 'transparent', flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-1)', fontFamily: 'inherit' }

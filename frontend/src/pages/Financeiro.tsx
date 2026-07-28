import { Fragment, useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Wallet, Clock3, TrendingUp, ChevronDown, ChevronRight, Building2, Layers3 } from "lucide-react";
import api from "../api";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
// Background   #F6F7FB   Surface #FFFFFF   Border #E4E7EE
// Ink primary  #10142B   Ink secondary #626A85
// Recebido     #0E9F6E   A receber #C2760C   Promotora accent #5B4FE0
// Display/mono for big figures: ui-monospace stack (tabular numerals)
// ---------------------------------------------------------------------------

interface Parcela {
  numero: number | null;
  valor: number;
  status: "recebido" | "a_receber";
}

interface Contract {
  id: string;
  empresa: string;
  promotora: string;
  modalidade: string;
  valorContrato: number;
  recebido: number;
  aReceber: number;
  parcelas: Parcela[];
}

const _now = new Date();
const _today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
const _monthStart = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-01`;

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const PROMOTORA_COLORS: Record<string, string> = {
  "Viva Saúde": "#5B4FE0",
  Bliss: "#0E9F6E",
  Multinotas: "#2F80ED",
  Allcross: "#C9CDD9",
};

const MODALIDADE_COLORS: Record<string, string> = {
  PME: "#10142B",
  "Odonto PF": "#5B4FE0",
  PF: "#2F80ED",
  Petlove: "#C2760C",
};

function aggregate(list: Contract[], key: "promotora" | "modalidade") {
  const map: Record<string, number> = {};
  list.forEach((c) => {
    map[c[key]] = (map[c[key]] || 0) + c.valorContrato;
  });
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function StatusPill({ recebido, valorContrato }: { recebido: number; valorContrato: number }) {
  if (valorContrato > 0 && recebido >= valorContrato) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Quitado
      </span>
    );
  }
  if (recebido === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Pendente
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Parcial
    </span>
  );
}

function KpiCard({ icon: Icon, eyebrow, value, sub, accent }: { icon: typeof Wallet; eyebrow: string; value: number; sub: string; accent: string }) {
  return (
    <div className="relative flex-1 overflow-hidden rounded-2xl border border-[#E4E7EE] bg-white p-5">
      <div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8891AC]">
          {eyebrow}
        </span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}1A` }}
        >
          <Icon size={16} color={accent} strokeWidth={2.25} />
        </div>
      </div>
      <div
        className="mt-3 text-[28px] font-bold leading-none text-[#10142B]"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {fmt(value)}
      </div>
      <div className="mt-2 text-[13px] text-[#626A85]">{sub}</div>
    </div>
  );
}

function Donut({ data, colors, centerLabel, centerSub }: { data: { name: string; value: number }[]; colors: Record<string, string>; centerLabel: string; centerSub: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-6">
      <div className="relative h-[132px] w-[132px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={44}
              outerRadius={62}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d, i) => (
                <Cell key={i} fill={colors[d.name] || "#C9CDD9"} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-[#10142B]">
            {centerLabel}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-[#8891AC]">{centerSub}</span>
        </div>
      </div>
      <ul className="flex-1 space-y-2.5">
        {data.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex items-center gap-2 text-[#39415C]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: colors[d.name] || "#C9CDD9" }}
              />
              {d.name}
            </span>
            <span className="font-medium text-[#10142B]">
              {total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0"}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FinanceiroDashboard() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(_monthStart);
  const [dateTo, setDateTo] = useState(_today);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const periodLabel =
    !dateFrom && !dateTo
      ? "Todo o período"
      : dateFrom === _monthStart && dateTo === _today
      ? "Este mês"
      : `${dateFrom.split("-").reverse().join("/")} – ${dateTo.split("-").reverse().join("/")}`;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    api
      .get<Contract[]>(`/api/v1/financeiro/contratos?${params}`)
      .then((r) => setContracts(r.data))
      .catch(() => setContracts([]))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  const totals = useMemo(() => {
    const valorContrato = contracts.reduce((s, c) => s + c.valorContrato, 0);
    const recebido = contracts.reduce((s, c) => s + c.recebido, 0);
    const aReceber = contracts.reduce((s, c) => s + c.aReceber, 0);
    return { valorContrato, recebido, aReceber, pct: valorContrato > 0 ? (recebido / valorContrato) * 100 : 0 };
  }, [contracts]);

  const byPromotora = useMemo(() => aggregate(contracts, "promotora"), [contracts]);
  const byModalidade = useMemo(() => aggregate(contracts, "modalidade"), [contracts]);

  return (
    <div className="min-h-full w-full bg-[#F6F7FB] p-8">
      <div className="mx-auto max-w-[1180px]">
        {/* Header */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-[#10142B]">Financeiro</h1>
            <p className="mt-1 text-[13px] text-[#8891AC]">
              Valores consolidados por contrato, promotora e modalidade
            </p>
          </div>
          <div className="relative">
            <button
              onClick={() => setPeriodOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-[#E4E7EE] bg-white px-3.5 py-2 text-[13px] font-medium text-[#39415C] shadow-sm hover:bg-[#FAFBFC]"
            >
              {periodLabel}
              <ChevronDown size={14} />
            </button>
            {periodOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPeriodOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-[#E4E7EE] bg-white p-4 shadow-lg">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8891AC]">De</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="mt-1 mb-3 w-full rounded-lg border border-[#E4E7EE] px-2.5 py-1.5 text-[13px] text-[#10142B]"
                  />
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8891AC]">Até</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="mt-1 mb-3 w-full rounded-lg border border-[#E4E7EE] px-2.5 py-1.5 text-[13px] text-[#10142B]"
                  />
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => { setDateFrom(_monthStart); setDateTo(_today); }}
                      className="text-[12px] font-medium text-[#5B4FE0] hover:underline"
                    >
                      Este mês
                    </button>
                    <button
                      onClick={() => { setDateFrom(""); setDateTo(""); }}
                      className="text-[12px] font-medium text-[#5B4FE0] hover:underline"
                    >
                      Ver todo período
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <p className="py-20 text-center text-[13px] text-[#8891AC]">Carregando…</p>
        ) : contracts.length === 0 ? (
          <p className="py-20 text-center text-[13px] text-[#8891AC]">Nenhum contrato com receita confirmada neste período.</p>
        ) : (
          <>
            {/* KPI row */}
            <div className="flex gap-4">
              <KpiCard
                icon={Layers3}
                eyebrow="Valor do contrato"
                value={totals.valorContrato}
                sub={`${contracts.length} contratos ativos`}
                accent="#10142B"
              />
              <KpiCard
                icon={Wallet}
                eyebrow="Recebido"
                value={totals.recebido}
                sub="Confirmado no período"
                accent="#0E9F6E"
              />
              <KpiCard
                icon={Clock3}
                eyebrow="A receber"
                value={totals.aReceber}
                sub="Parcelas em aberto"
                accent="#C2760C"
              />
            </div>

            {/* Progress */}
            <div className="mt-4 rounded-2xl border border-[#E4E7EE] bg-white p-5">
              <div className="mb-2.5 flex items-center justify-between text-[13px]">
                <span className="font-medium text-[#39415C]">Recebido vs. a receber</span>
                <span className="flex items-center gap-1 font-semibold text-[#0E9F6E]">
                  <TrendingUp size={14} />
                  {totals.pct.toFixed(1)}% já recebido
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#FBEBD5]">
                <div
                  className="h-full rounded-full bg-[#0E9F6E]"
                  style={{ width: `${totals.pct}%` }}
                />
              </div>
            </div>

            {/* Breakdown */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-[#E4E7EE] bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Building2 size={15} className="text-[#8891AC]" />
                  <h2 className="text-[13px] font-semibold text-[#10142B]">Por promotora</h2>
                </div>
                <Donut
                  data={byPromotora}
                  colors={PROMOTORA_COLORS}
                  centerLabel={`${byPromotora.length}`}
                  centerSub="promotoras"
                />
              </div>
              <div className="rounded-2xl border border-[#E4E7EE] bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Layers3 size={15} className="text-[#8891AC]" />
                  <h2 className="text-[13px] font-semibold text-[#10142B]">Por modalidade</h2>
                </div>
                <Donut
                  data={byModalidade}
                  colors={MODALIDADE_COLORS}
                  centerLabel={`${byModalidade.length}`}
                  centerSub="modalidades"
                />
              </div>
            </div>

            {/* Table */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-[#E4E7EE] bg-white">
              <div className="border-b border-[#E4E7EE] px-5 py-4">
                <h2 className="text-[13px] font-semibold text-[#10142B]">Contratos</h2>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#E4E7EE] text-[11px] uppercase tracking-wider text-[#8891AC]">
                    <th className="w-8 px-2 py-3" />
                    <th className="px-5 py-3 font-semibold">Empresa</th>
                    <th className="px-5 py-3 font-semibold">Promotora</th>
                    <th className="px-5 py-3 font-semibold">Modalidade</th>
                    <th className="px-5 py-3 text-right font-semibold">Valor do contrato</th>
                    <th className="px-5 py-3 text-right font-semibold">Recebido</th>
                    <th className="px-5 py-3 text-right font-semibold">A receber</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => {
                    const expanded = expandedRows.has(c.id);
                    const hasParcelas = c.parcelas && c.parcelas.length > 0;
                    return (
                    <Fragment key={c.id}>
                    <tr
                      onClick={() => hasParcelas && toggleRow(c.id)}
                      className="border-b border-[#F0F1F5] last:border-0 hover:bg-[#FAFBFC]"
                      style={{ cursor: hasParcelas ? "pointer" : "default" }}
                    >
                      <td className="px-2 py-3.5 text-center text-[#8891AC]">
                        {hasParcelas && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-[#10142B]">{c.empresa}</td>
                      <td className="px-5 py-3.5 text-[#626A85]">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: PROMOTORA_COLORS[c.promotora] || "#C9CDD9" }}
                          />
                          {c.promotora}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[#626A85]">{c.modalidade}</td>
                      <td className="px-5 py-3.5 text-right text-[#10142B]">
                        {fmt(c.valorContrato)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-[#0E9F6E]">
                        {fmt(c.recebido)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-[#C2760C]">
                        {fmt(c.aReceber)}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusPill recebido={c.recebido} valorContrato={c.valorContrato} />
                      </td>
                    </tr>
                    {expanded && hasParcelas && (
                      <tr className="border-b border-[#F0F1F5] bg-[#FAFBFC]">
                        <td colSpan={8} className="px-5 py-4">
                          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#8891AC]">
                            Parcelas — {c.empresa}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {c.parcelas.map((p, i) => {
                              const cor = p.status === "recebido" ? "#0E9F6E" : "#C2760C";
                              const bg = p.status === "recebido" ? "#ECFDF5" : "#FFFBEB";
                              return (
                                <div
                                  key={i}
                                  className="rounded-lg px-3 py-2 text-[12px]"
                                  style={{ background: bg, border: `1px solid ${cor}33`, minWidth: 110 }}
                                >
                                  <div className="font-semibold" style={{ color: cor }}>
                                    {p.numero ? `${p.numero}ª parcela` : "Valor único"}
                                  </div>
                                  <div
                                    className="mt-0.5"
                                    style={{ color: "#10142B" }}
                                  >
                                    {fmt(p.valor)}
                                  </div>
                                  <div className="mt-0.5 text-[10px]" style={{ color: cor }}>
                                    {p.status === "recebido" ? "Recebido" : "A receber"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#FAFBFC]">
                    <td className="px-5 py-3.5 font-semibold text-[#10142B]" colSpan={4}>
                      Total
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#10142B]">
                      {fmt(totals.valorContrato)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#0E9F6E]">
                      {fmt(totals.recebido)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#C2760C]">
                      {fmt(totals.aReceber)}
                    </td>
                    <td className="px-5 py-3.5" />
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

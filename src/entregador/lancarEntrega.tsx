import { useRef, useState } from 'react'
import { Camera, CheckCircle2, ClipboardPaste, ImageIcon, Loader2, TriangleAlert, X } from 'lucide-react'
import { SUPABASE_ANON, SUPABASE_URL, mensagemErro } from '../lib/publico'
import { cn } from '../lib/util'

/**
 * Lançar uma entrega que veio de outro cardápio (Anota Aí, Cardápio Web...):
 * foto da comanda ou texto colado → a IA lê → confere → vira entrega para os motoboys.
 * Usado no app do motoboy (motoboyToken) e no painel da loja (lojaId + sessão).
 */
export type EntregaLida = {
  plataforma: string | null; numero_externo: string | null; cliente_nome: string | null; cliente_telefone: string | null
  endereco: { rua: string | null; numero: string | null; bairro: string | null; complemento: string | null; referencia: string | null; cidade: string | null; cep: string | null }
  itens: { quantidade: number; nome: string; observacao: string | null }[]
  taxa_entrega: number | null; total: number | null; pagamento: string; pago: boolean; troco_para: number | null; observacao: string | null; duvidas: string[]
}
type Acesso = { motoboyToken: string } | { lojaId: string; sessao: () => Promise<string | undefined> }

async function chamar<T>(acesso: Acesso, corpo: Record<string, unknown>): Promise<T> {
  const token = 'sessao' in acesso ? await acesso.sessao() : undefined
  const extra = 'motoboyToken' in acesso ? { motoboy_token: acesso.motoboyToken } : { loja_id: acesso.lojaId }
  let r: Response
  try {
    r = await fetch(`${SUPABASE_URL}/functions/v1/entregas-externas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${token || SUPABASE_ANON}` },
      body: JSON.stringify({ ...corpo, ...extra }),
    })
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
  const d = await r.json().catch(() => null)
  if (!r.ok || d?.erro) throw new Error(d?.erro || mensagemErro(d?.message || `Erro ${r.status}`))
  return d as T
}

/** Reduz a foto (até 1600 px, JPEG) para subir rápido no 4G */
async function lerFoto(f: File): Promise<string> {
  try {
    const bmp = await createImageBitmap(f)
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * escala)
    c.height = Math.round(bmp.height * escala)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.85)
  } catch {
    return new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f) })
  }
}

const PAGAMENTOS: [string, string][] = [['dinheiro', 'Dinheiro'], ['cartao_entrega', 'Cartão na entrega'], ['pix', 'Pix'], ['cartao', 'Pago online'], ['outro', 'Outro']]
const valorTexto = (n: number | null) => (n == null ? '' : n.toFixed(2).replace('.', ','))
const lerValor = (v: string) => {
  const t = v.replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(t)
  return t && Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
const itensTexto = (itens: EntregaLida['itens']) => itens.map((i) => `${i.quantidade}x ${i.nome}${i.observacao ? ` (${i.observacao})` : ''}`).join('\n')
function lerItens(t: string): EntregaLida['itens'] {
  return t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(\d+)\s*x?\s+(.*)$/i)
    const resto = m ? m[2] : l
    const obs = resto.match(/^(.*?)\s*\((.*)\)\s*$/)
    return { quantidade: m ? Math.max(1, Number(m[1])) : 1, nome: (obs ? obs[1] : resto).trim(), observacao: obs ? obs[2].trim() : null }
  })
}

export function LancarEntrega({ acesso, fechar, feito, perguntarPronto }: {
  acesso: Acesso; fechar: () => void; feito: (r: { numero: number; novo: boolean }) => void; perguntarPronto?: boolean
}) {
  const [etapa, setEtapa] = useState<'escolher' | 'lendo' | 'conferir'>('escolher')
  const [texto, setTexto] = useState('')
  const [colar, setColar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [fonte, setFonte] = useState<'foto' | 'texto' | 'manual'>('manual')
  const [f, setF] = useState<EntregaLida | null>(null)
  const [itens, setItens] = useState('')
  const [total, setTotal] = useState('')
  const [taxa, setTaxa] = useState('')
  const [troco, setTroco] = useState('')
  const [pronto, setPronto] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)

  const abrirConferencia = (p: EntregaLida, origem: 'foto' | 'texto' | 'manual') => {
    setF(p); setFonte(origem)
    setItens(itensTexto(p.itens)); setTotal(valorTexto(p.total)); setTaxa(valorTexto(p.taxa_entrega)); setTroco(valorTexto(p.troco_para))
    setEtapa('conferir')
  }
  const ler = async (corpo: { foto?: string; texto?: string }) => {
    setErro(null); setEtapa('lendo')
    try {
      const r = await chamar<{ pedido: EntregaLida; fonte: 'foto' | 'texto' }>(acesso, { acao: 'ler', ...corpo })
      abrirConferencia(r.pedido, r.fonte)
    } catch (e) {
      setErro((e as Error).message)
      setEtapa('escolher')
    }
  }
  const aoEscolherFoto = async (lista: FileList | null) => {
    const arq = lista?.[0]
    if (!arq) return
    setEtapa('lendo')
    try { await ler({ foto: await lerFoto(arq) }) } catch (e) { setErro(mensagemErro(e)); setEtapa('escolher') }
  }
  const manual = () => abrirConferencia({
    plataforma: null, numero_externo: null, cliente_nome: null, cliente_telefone: null,
    endereco: { rua: null, numero: null, bairro: null, complemento: null, referencia: null, cidade: null, cep: null },
    itens: [], taxa_entrega: null, total: null, pagamento: 'dinheiro', pago: false, troco_para: null, observacao: null, duvidas: [],
  }, 'manual')

  const criar = async () => {
    if (!f) return
    if (!f.endereco.rua?.trim()) return setErro('Informe a rua da entrega.')
    setErro(null); setSalvando(true)
    try {
      const pedido = { ...f, itens: lerItens(itens), total: lerValor(total), taxa_entrega: lerValor(taxa), troco_para: f.pagamento === 'dinheiro' ? lerValor(troco) : null }
      const r = await chamar<{ numero: number; novo: boolean }>(acesso, { acao: 'criar', pedido, fonte, pronto })
      feito(r)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }
  const muda = (campo: keyof EntregaLida, v: unknown) => setF((x) => (x ? { ...x, [campo]: v } : x))
  const mudaEnd = (campo: keyof EntregaLida['endereco'], v: string) => setF((x) => (x ? { ...x, endereco: { ...x.endereco, [campo]: v || null } } : x))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center" onClick={() => !salvando && etapa !== 'lendo' && fechar()}>
      <div className="max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-tinta/10 sm:hidden" />
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold">{etapa === 'conferir' ? 'Confira a entrega' : 'Lançar entrega'}</div>
          {etapa !== 'lendo' && <button onClick={fechar} className="grid h-9 w-9 place-items-center rounded-full bg-fundo" aria-label="Fechar"><X className="h-4 w-4" /></button>}
        </div>

        {etapa === 'escolher' && (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-tinta-2">Pedido do Anota Aí, Cardápio Web ou outro cardápio: tire uma foto da comanda e a IA preenche a entrega para você.</p>
            <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { aoEscolherFoto(e.target.files); e.target.value = '' }} />
            <input ref={galeria} type="file" accept="image/*" className="hidden" onChange={(e) => { aoEscolherFoto(e.target.files); e.target.value = '' }} />
            <button onClick={() => camera.current?.click()} className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold" style={{ background: 'var(--cor)', color: 'var(--cor-texto, #fff)' }}>
              <Camera className="h-5 w-5" />Tirar foto da comanda
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => galeria.current?.click()} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-linha-2 text-[14px] font-medium"><ImageIcon className="h-4 w-4" />Usar um print</button>
              <button onClick={() => setColar(!colar)} className={cn('flex h-12 items-center justify-center gap-2 rounded-xl border text-[14px] font-medium', colar ? 'border-tinta' : 'border-linha-2')}><ClipboardPaste className="h-4 w-4" />Colar texto</button>
            </div>
            {colar && (
              <div className="space-y-2">
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} autoFocus placeholder="Cole aqui o pedido que chegou no WhatsApp ou no painel do cardápio"
                  className="w-full rounded-xl border border-linha-2 px-3 py-2 text-[14px] outline-none focus:border-[var(--cor)]" />
                <button onClick={() => ler({ texto })} disabled={texto.trim().length < 10} className="flex h-12 w-full items-center justify-center rounded-xl bg-tinta text-[15px] font-semibold text-white disabled:opacity-40">Ler pedido</button>
              </div>
            )}
            {erro && <div className="rounded-xl bg-erro-50 px-3 py-2 text-[13px] text-erro">{erro}</div>}
            <button onClick={manual} className="h-9 w-full text-center text-[13px] text-tinta-3 underline">Preencher à mão</button>
          </div>
        )}

        {etapa === 'lendo' && (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin" style={{ color: 'var(--cor)' }} />
            <div className="mt-3 font-semibold">Lendo o pedido…</div>
            <div className="mt-1 text-[13px] text-tinta-3">Leva uns segundos.</div>
          </div>
        )}

        {etapa === 'conferir' && f && (
          <div className="mt-3 space-y-3">
            {f.duvidas.length > 0 && (
              <div className="rounded-xl bg-alerta-50 px-3 py-2 text-[13px] text-[#8A5500]">
                <div className="flex items-center gap-1.5 font-semibold"><TriangleAlert className="h-4 w-4" />Confira antes de criar:</div>
                <ul className="mt-1 list-disc pl-5">{f.duvidas.map((d, i) => <li key={i}>{d}</li>)}</ul>
              </div>
            )}
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <Entrada rotulo="Cardápio de origem" valor={f.plataforma ?? ''} mudar={(v) => muda('plataforma', v || null)} dica="Anota Aí, Cardápio Web…" />
              <Entrada rotulo="Nº do pedido" valor={f.numero_externo ?? ''} mudar={(v) => muda('numero_externo', v || null)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Entrada rotulo="Cliente" valor={f.cliente_nome ?? ''} mudar={(v) => muda('cliente_nome', v || null)} />
              <Entrada rotulo="Telefone" valor={f.cliente_telefone ?? ''} mudar={(v) => muda('cliente_telefone', v.replace(/\D/g, '') || null)} tipo="tel" />
            </div>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <Entrada rotulo="Rua *" valor={f.endereco.rua ?? ''} mudar={(v) => mudaEnd('rua', v)} />
              <Entrada rotulo="Número" valor={f.endereco.numero ?? ''} mudar={(v) => mudaEnd('numero', v)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Entrada rotulo="Bairro" valor={f.endereco.bairro ?? ''} mudar={(v) => mudaEnd('bairro', v)} />
              <Entrada rotulo="Cidade" valor={f.endereco.cidade ?? ''} mudar={(v) => mudaEnd('cidade', v)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Entrada rotulo="Complemento" valor={f.endereco.complemento ?? ''} mudar={(v) => mudaEnd('complemento', v)} />
              <Entrada rotulo="Referência" valor={f.endereco.referencia ?? ''} mudar={(v) => mudaEnd('referencia', v)} />
            </div>
            <label className="block">
              <span className="text-[12px] font-medium text-tinta-3">Itens (um por linha)</span>
              <textarea value={itens} onChange={(e) => setItens(e.target.value)} rows={Math.min(6, Math.max(2, itens.split('\n').length))} placeholder="1x X-Burguer"
                className="mt-0.5 w-full rounded-xl border border-linha-2 px-3 py-2 text-[14px] outline-none focus:border-[var(--cor)]" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Entrada rotulo="Total do pedido (R$)" valor={total} mudar={setTotal} tipo="decimal" />
              <Entrada rotulo="Taxa de entrega (R$)" valor={taxa} mudar={setTaxa} tipo="decimal" />
            </div>
            <div>
              <span className="text-[12px] font-medium text-tinta-3">Pagamento</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {PAGAMENTOS.map(([id, nome]) => (
                  <button key={id} onClick={() => setF({ ...f, pagamento: id, pago: id === 'cartao' ? true : id === 'pix' ? f.pago : false })}
                    className={cn('h-9 rounded-full border px-3 text-[13px] font-medium', f.pagamento === id ? 'border-transparent' : 'border-linha-2 text-tinta-2')}
                    style={f.pagamento === id ? { background: 'var(--cor)', color: 'var(--cor-texto, #fff)' } : undefined}>{nome}</button>
                ))}
              </div>
              {f.pagamento === 'dinheiro' && <div className="mt-2 w-1/2"><Entrada rotulo="Troco para (R$)" valor={troco} mudar={setTroco} tipo="decimal" /></div>}
              {['pix', 'outro'].includes(f.pagamento) && (
                <label className="mt-2 flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.pago} onChange={(e) => muda('pago', e.target.checked)} className="h-4 w-4" />Já está pago (motoboy não cobra)</label>
              )}
            </div>
            <Entrada rotulo="Observação para o motoboy" valor={f.observacao ?? ''} mudar={(v) => muda('observacao', v || null)} />
            {perguntarPronto && (
              <label className="flex items-center gap-2 rounded-xl bg-fundo px-3 py-2.5 text-[14px]"><input type="checkbox" checked={pronto} onChange={(e) => setPronto(e.target.checked)} className="h-4 w-4" />Pronto para sair agora (avisa os motoboys)</label>
            )}
            {erro && <div className="rounded-xl bg-erro-50 px-3 py-2 text-[13px] text-erro">{erro}</div>}
            <button onClick={criar} disabled={salvando} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ok text-[15px] font-semibold text-white disabled:opacity-60">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Criar entrega
            </button>
            <button onClick={() => { setEtapa('escolher'); setErro(null) }} className="h-9 w-full text-[13px] text-tinta-3">Voltar e ler outra foto</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Entrada({ rotulo, valor, mudar, tipo, dica }: { rotulo: string; valor: string; mudar: (v: string) => void; tipo?: 'tel' | 'decimal'; dica?: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-[12px] font-medium text-tinta-3">{rotulo}</span>
      <input value={valor} onChange={(e) => mudar(e.target.value)} inputMode={tipo === 'tel' ? 'tel' : tipo === 'decimal' ? 'decimal' : undefined} placeholder={dica}
        className="mt-0.5 h-11 w-full rounded-xl border border-linha-2 px-3 text-[14px] outline-none focus:border-[var(--cor)]" />
    </label>
  )
}

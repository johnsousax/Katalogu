# Trechos trocados nos arquivos que já existem (aplicados com replace exato; cada trecho antigo tem que aparecer 1 vez)
P = []
def troca(caminho, velho, novo):
    P.append({"caminho": caminho, "velho": velho, "novo": novo})

E = "src/entregador/Entregador.tsx"
troca(E, "import { ArrowLeftRight, Bike, Route, CheckCircle2,", "import { ArrowLeftRight, Bike, Camera, Route, CheckCircle2,")
troca(E, "import { CartaoAvisos, FaixaPronto, useAvisoPronto } from './avisoPronto'\n",
      "import { CartaoAvisos, FaixaPronto, useAvisoPronto } from './avisoPronto'\nimport { LancarEntrega } from './lancarEntrega'\nimport { MapaEntrega } from './mapaEntrega'\n")
troca(E, "  canal?: string; externo_display?: string | null; pede_codigo?: boolean\n",
      "  canal?: string; externo_display?: string | null; pede_codigo?: boolean; plataforma?: string | null\n")
troca(E, "  liberado?: boolean; motivo?: 'inativo' | 'fora_escala' | null\n",
      "  liberado?: boolean; motivo?: 'inativo' | 'fora_escala' | null; pode_lancar?: boolean\n")
troca(E, "  const [transferir, setTransferir] = useState<Ped | null>(null)\n  const loc = useLocalizacao(token)\n",
      "  const [transferir, setTransferir] = useState<Ped | null>(null)\n  const [lancar, setLancar] = useState(false)\n  const [verMapa, setVerMapa] = useState<Ped[] | null>(null)\n  const loc = useLocalizacao(token)\n")
# selo do cardápio de origem ao lado do número
troca(E, "{x.canal === 'ifood' && <span className=\"ml-1.5 rounded bg-[#EA1D2C] px-1.5 py-0.5 font-sans text-[11px] font-semibold text-white align-middle\">iFood{x.externo_display ? ` #${x.externo_display}` : ''}</span>}</div>\n        <span className={cn('rounded-full px-2.5",
      "{x.canal === 'ifood' && <span className=\"ml-1.5 rounded bg-[#EA1D2C] px-1.5 py-0.5 font-sans text-[11px] font-semibold text-white align-middle\">iFood{x.externo_display ? ` #${x.externo_display}` : ''}</span>}{x.canal === 'externo' && <span className=\"ml-1.5 rounded bg-tinta px-1.5 py-0.5 font-sans text-[11px] font-semibold text-white align-middle\">{x.plataforma || 'Outro cardápio'}{x.externo_display ? ` #${x.externo_display}` : ''}</span>}</div>\n        <span className={cn('rounded-full px-2.5")
# botão Mapa abre o mapa dentro do app
troca(E, "{x.mapa && <a href={x.mapa} target=\"_blank\" rel=\"noreferrer\" className=\"flex flex-col items-center gap-1 rounded-xl border border-linha-2 py-2 text-[12px] font-medium\"><Navigation className=\"h-4 w-4\" style={{ color: 'var(--cor)' }} />Mapa</a>}",
      "{x.mapa && <button onClick={() => setVerMapa([x])} className=\"flex flex-col items-center gap-1 rounded-xl border border-linha-2 py-2 text-[12px] font-medium\"><Navigation className=\"h-4 w-4\" style={{ color: 'var(--cor)' }} />Mapa</button>}")
troca(E, "{mapa && <a href={mapa} target=\"_blank\" rel=\"noreferrer\" className=\"flex h-9 items-center gap-1 rounded-full bg-white/20 px-3 text-[12px] font-semibold\"><Navigation className=\"h-3.5 w-3.5\" />Rota no mapa</a>}",
      "{mapa && <button onClick={() => setVerMapa(paradas)} className=\"flex h-9 items-center gap-1 rounded-full bg-white/20 px-3 text-[12px] font-semibold\"><Navigation className=\"h-3.5 w-3.5\" />Rota no mapa</button>}")
# botão de lançar entrega por foto, logo abaixo do cartão de localização
troca(E, "        <CartaoLocalizacao ultimoEnvio={loc.ultimoEnvio} />\n",
      "        <CartaoLocalizacao ultimoEnvio={loc.ultimoEnvio} />\n"
      "        {liberado && p.pode_lancar !== false && (\n"
      "          <button onClick={() => setLancar(true)} className=\"flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-cartao\">\n"
      "            <span className=\"grid h-10 w-10 shrink-0 place-items-center rounded-full\" style={{ background: 'var(--cor)', color: 'var(--cor-texto)' }}><Camera className=\"h-5 w-5\" /></span>\n"
      "            <span className=\"min-w-0 flex-1\"><span className=\"block text-sm font-semibold\">Lançar entrega por foto</span><span className=\"block text-[12px] text-tinta-3\">Pedido do Anota Aí, Cardápio Web ou outro: fotografe a comanda.</span></span>\n"
      "          </button>\n"
      "        )}\n")
troca(E, "        {transferir && <PassarEntrega",
      "        {lancar && <LancarEntrega acesso={{ motoboyToken: token }} fechar={() => setLancar(false)}\n"
      "          feito={async (r) => { setLancar(false); alert(r.novo ? `Entrega #${r.numero} criada. Ela já está em Minhas entregas.` : `Essa comanda já foi lançada (entrega #${r.numero}).`); setAba('minhas'); await carregar() }} />}\n"
      "        {verMapa && <MapaEntrega paradas={verMapa} fechar={() => setVerMapa(null)} />}\n\n"
      "        {transferir && <PassarEntrega")

M = "src/app/paginas/Motoboys.tsx"
troca(M, "import { Bike, Copy, ExternalLink, MessageCircle, Plus, Send, Trash2 } from 'lucide-react'",
      "import { Bike, Camera, Copy, ExternalLink, MessageCircle, Plus, Send, Trash2 } from 'lucide-react'")
troca(M, "import { RotasPainel } from '../rotas'\n",
      "import { RotasPainel } from '../rotas'\nimport { LancarEntrega } from '../../entregador/lancarEntrega'\nimport { avisar, corContraste } from '../../lib/util'\n")
troca(M, "  const [ver, setVer] = useState<Rel | null>(null)\n",
      "  const [ver, setVer] = useState<Rel | null>(null)\n  const [lancar, setLancar] = useState(false)\n")
troca(M, "        acoes={<Botao icone={<Plus className=\"h-4 w-4\" />} onClick={() => setEditar({ ativo: true, taxa_por_entrega: 0 })}>Novo motoboy</Botao>} />\n",
      "        acoes={<>\n"
      "          <Botao variante=\"secundario\" icone={<Camera className=\"h-4 w-4\" />} onClick={() => setLancar(true)}>Lançar entrega</Botao>\n"
      "          <Botao icone={<Plus className=\"h-4 w-4\" />} onClick={() => setEditar({ ativo: true, taxa_por_entrega: 0 })}>Novo motoboy</Botao>\n"
      "        </>} />\n"
      "      <div className=\"cartao mb-4 p-4\">\n"
      "        <Alternador ligado={ctx.loja.motoboy_lanca_entregas !== false} aoMudar={(v) => executar(async () => { ok(await sb.from('lojas').update({ motoboy_lanca_entregas: v }).eq('id', ctx.loja.id)); await ctx.recarregarLoja() }, v ? 'Motoboys podem lançar entregas' : 'Só a loja lança entregas')}\n"
      "          rotulo=\"Motoboy lança entrega por foto\" descricao=\"Pedidos do Anota Aí, Cardápio Web e outros cardápios: o motoboy fotografa a comanda no app dele e a entrega entra aqui. A loja também pode lançar pelo botão Lançar entrega (foto ou texto colado).\" />\n"
      "      </div>\n"
      "      {lancar && (\n"
      "        <div style={{ ['--cor' as any]: ctx.loja.cor_primaria || '#1A4DF5', ['--cor-texto' as any]: corContraste(ctx.loja.cor_primaria || '#1A4DF5') }}>\n"
      "          <LancarEntrega acesso={{ lojaId: ctx.loja.id, sessao: async () => (await sb.auth.getSession()).data.session?.access_token }} perguntarPronto\n"
      "            fechar={() => setLancar(false)} feito={(r) => { setLancar(false); avisar(r.novo ? `Entrega #${r.numero} criada` : `Essa comanda já foi lançada (#${r.numero})`); recarregar(true) }} />\n"
      "        </div>\n"
      "      )}\n")

C = "src/app/contexto.tsx"
troca(C, "'ifood' | 'whatsapp_admin' | 'trafego_gerenciado', boolean>>", "'ifood' | 'whatsapp_admin' | 'trafego_gerenciado' | 'so_entregas', boolean>>")
troca(C, "  motoboy_localizacao_auto?: boolean\n", "  motoboy_localizacao_auto?: boolean\n  motoboy_lanca_entregas?: boolean\n")
troca(C, "ifood: 'iFood', admin: 'WhatsApp (admin)' }", "ifood: 'iFood', admin: 'WhatsApp (admin)', externo: 'Outro cardápio' }")

I = "src/app/impressao.ts"
troca(I, "balcao: 'Balcão', admin: 'WhatsApp' }", "balcao: 'Balcão', admin: 'WhatsApp', externo: 'Outro cardápio' }")

# Plano "Só Entregas": menu enxuto e a página de motoboys como início
PN = "src/app/Painel.tsx"
troca(PN, "const TODOS = MENU.flatMap((g) => g.itens)\n",
      "const TODOS = MENU.flatMap((g) => g.itens)\n/** Plano Só Entregas: só o que serve para quem usa o Katalogu para os motoboys */\nconst SO_ENTREGAS = ['motoboys', 'pedidos', 'financeiro', 'loja', 'equipe', 'plano']\n")
troca(PN, "  const ocultarPlano = !!ctx.loja.ocultar_plano && !ctx.admin\n  const visiveis = useMemo(() => MENU.map((g) => ({ ...g, itens: g.itens.filter((i) => !i.oculto && (!i.papeis || i.papeis.includes(ctx.papel)) && !(ocultarPlano && i.id === 'plano')) })).filter((g) => g.itens.length), [ctx.papel, ocultarPlano])\n  const item = TODOS.find((i) => i.id === id)\n  const permitido = item && (!item.papeis || item.papeis.includes(ctx.papel))\n",
      "  const ocultarPlano = !!ctx.loja.ocultar_plano && !ctx.admin\n  const soEntregas = !!ctx.recursos.so_entregas\n  const visiveis = useMemo(() => MENU.map((g) => ({ ...g, itens: g.itens.filter((i) => !i.oculto && (!i.papeis || i.papeis.includes(ctx.papel)) && !(ocultarPlano && i.id === 'plano') && (!soEntregas || SO_ENTREGAS.includes(i.id))) })).filter((g) => g.itens.length), [ctx.papel, ocultarPlano, soEntregas])\n  const item = TODOS.find((i) => i.id === (soEntregas && id === 'inicio' ? 'motoboys' : id))\n  const permitido = item && (!item.papeis || item.papeis.includes(ctx.papel)) && (!soEntregas || SO_ENTREGAS.includes(item.id))\n")
troca(PN, "  const rapidos = useMemo(() => ['inicio', 'pedidos', 'produtos', 'clientes', 'estoque', 'financeiro']\n",
      "  const rapidos = useMemo(() => (soEntregas ? ['motoboys', 'pedidos', 'financeiro'] : ['inicio', 'pedidos', 'produtos', 'clientes', 'estoque', 'financeiro'])\n")
troca(PN, "    .slice(0, 4), [ctx.papel, ctx.recursos])\n", "    .slice(0, 4), [ctx.papel, ctx.recursos, soEntregas])\n")

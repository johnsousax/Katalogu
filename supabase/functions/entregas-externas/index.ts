// Entregas de outros cardápios (Anota Aí, Cardápio Web, iFood próprio etc.): a IA lê a foto da comanda ou o texto colado
// e cria a entrega para os motoboys. Usada pelo painel (loja logada) e pelo app do motoboy (token do motoboy).
// /functions/v1/entregas-externas  { acao: 'ler' | 'criar', loja_id? | motoboy_token?, foto?, texto?, pedido? }
import { admin, cfg, exigirPapel, Falha, json, n8n, tratar } from "./_shared/comum.ts";

type Endereco = { rua: string | null; numero: string | null; bairro: string | null; complemento: string | null; referencia: string | null; cidade: string | null; cep: string | null };
type Item = { quantidade: number; nome: string; observacao: string | null };
type Lido = {
  plataforma: string | null; numero_externo: string | null; cliente_nome: string | null; cliente_telefone: string | null; endereco: Endereco;
  itens: Item[]; taxa_entrega: number | null; total: number | null; pagamento: "pix" | "cartao" | "dinheiro" | "cartao_entrega" | "outro";
  pago: boolean; troco_para: number | null; observacao: string | null; duvidas: string[];
};

const TEXTO_OU_NULO = { type: ["string", "null"] };
const NUM_OU_NULO = { type: ["number", "null"] };
const ESQUEMA = {
  type: "object", additionalProperties: false,
  required: ["plataforma", "numero_externo", "cliente_nome", "cliente_telefone", "endereco", "itens", "taxa_entrega", "total", "pagamento", "pago", "troco_para", "observacao", "duvidas"],
  properties: {
    plataforma: TEXTO_OU_NULO, numero_externo: TEXTO_OU_NULO, cliente_nome: TEXTO_OU_NULO, cliente_telefone: TEXTO_OU_NULO,
    endereco: {
      type: "object", additionalProperties: false, required: ["rua", "numero", "bairro", "complemento", "referencia", "cidade", "cep"],
      properties: { rua: TEXTO_OU_NULO, numero: TEXTO_OU_NULO, bairro: TEXTO_OU_NULO, complemento: TEXTO_OU_NULO, referencia: TEXTO_OU_NULO, cidade: TEXTO_OU_NULO, cep: TEXTO_OU_NULO },
    },
    itens: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["quantidade", "nome", "observacao"], properties: { quantidade: { type: "number" }, nome: { type: "string" }, observacao: TEXTO_OU_NULO } },
    },
    taxa_entrega: NUM_OU_NULO, total: NUM_OU_NULO,
    pagamento: { type: "string", enum: ["pix", "cartao", "dinheiro", "cartao_entrega", "outro"] },
    pago: { type: "boolean" }, troco_para: NUM_OU_NULO, observacao: TEXTO_OU_NULO,
    duvidas: { type: "array", items: { type: "string" } },
  },
};

const REGRAS = `Você lê comandas e pedidos de delivery de restaurantes brasileiros (impressos, prints de tela ou texto do WhatsApp) para um entregador levar.
Vêm de cardápios digitais como Anota Aí, Cardápio Web, Goomer, Saipos, Delivery Much, Aiqfome, iFood, Neemo, Menu Dino, ou de pedidos feitos à mão.
Regras:
- "plataforma": nome do sistema de onde veio o pedido, se aparecer (logo, rodapé, cabeçalho). Senão null.
- "numero_externo": o número do pedido na comanda (ex.: "Pedido #1234" → "1234"). Senão null.
- Cliente: nome e telefone como estão escritos. Telefone só com números e DDD quando houver.
- Endereço: separe rua (com tipo: Rua, Av., Travessa...), número, bairro, complemento (apto, bloco, casa), ponto de referência, cidade e CEP. Não invente nada que não esteja escrito.
- "itens": quantidade e nome de cada produto; adicionais e observações do item vão em "observacao" do item.
- "taxa_entrega" e "total" em reais como número (R$ 45,90 → 45.9). "total" é o valor final que o cliente paga, já com a taxa.
- "pagamento": dinheiro; cartao_entrega (cartão/maquininha na entrega, débito, crédito); pix; cartao (cartão já pago online); outro (vale-refeição, outros).
- "pago": true só quando a comanda diz que já está pago (pago online, Pix pago, "não cobrar"). Pagamento na entrega = false.
- "troco_para": quando diz "troco para R$ 100" use 100. Senão null.
- "observacao": observações gerais do pedido para o entregador (ex.: "tocar a campainha", "deixar na portaria").
- "duvidas": frases curtas sobre o que ficou ilegível ou faltando (ex.: "número da casa ilegível"). Lista vazia se tudo estiver claro.
- Se a imagem não for um pedido de delivery, devolva campos nulos e explique em "duvidas".`;

async function ia(conteudo: unknown[]): Promise<Lido> {
  const chave = await cfg("openai");
  const pedido = {
    model: "gpt-4.1", temperature: 0, max_completion_tokens: 4000,
    response_format: { type: "json_schema", json_schema: { name: "entrega", strict: true, schema: ESQUEMA } },
    messages: [{ role: "system", content: REGRAS }, { role: "user", content: [{ type: "text", text: "Leia este pedido de delivery." }, ...conteudo] }],
  };
  let d: any;
  if (!chave) {
    // Sem chave no servidor: mesma ponte do atendente de IA (n8n → OpenAI)
    d = await n8n("gi-openai", { tipo: "chat", corpo: pedido }, 60_000).catch((e) => { console.error("ia n8n", e); throw new Falha("Não consegui ler o pedido agora. Tente de novo."); });
  } else {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
        body: JSON.stringify(pedido),
      });
      d = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error("openai", r.status, JSON.stringify(d).slice(0, 400));
        throw new Falha(r.status === 429 ? "A leitura por IA está ocupada agora. Tente de novo em 1 minuto." : "Não consegui ler o pedido agora. Tente de novo.");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Falha("A leitura demorou demais. Tente de novo com uma foto mais nítida.");
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
  const txt = d?.choices?.[0]?.message?.content;
  if (!txt) { console.error("ia resposta", JSON.stringify(d).slice(0, 400)); throw new Falha("Não consegui ler o pedido agora. Tente de novo."); }
  return JSON.parse(txt) as Lido;
}

const num = (v: unknown) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };
const txt = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max) || null;
const PAGAMENTOS = ["pix", "cartao", "dinheiro", "cartao_entrega", "outro"];

/** Confere e limpa o que veio da IA ou da tela de conferência */
function arrumar(p: any): Lido {
  const e = p?.endereco ?? {};
  return {
    plataforma: txt(p?.plataforma, 60), numero_externo: txt(p?.numero_externo, 40)?.replace(/^#/, "") ?? null,
    cliente_nome: txt(p?.cliente_nome, 120), cliente_telefone: String(p?.cliente_telefone ?? "").replace(/\D/g, "").slice(0, 13) || null,
    endereco: { rua: txt(e.rua), numero: txt(e.numero, 20), bairro: txt(e.bairro, 80), complemento: txt(e.complemento), referencia: txt(e.referencia), cidade: txt(e.cidade, 80), cep: String(e.cep ?? "").replace(/\D/g, "").slice(0, 8) || null },
    itens: (Array.isArray(p?.itens) ? p.itens : []).filter((i: any) => txt(i?.nome)).slice(0, 60)
      .map((i: any) => ({ quantidade: Math.max(1, Math.round(Number(i.quantidade) || 1)), nome: txt(i.nome)!, observacao: txt(i.observacao, 300) })),
    taxa_entrega: num(p?.taxa_entrega), total: num(p?.total),
    pagamento: PAGAMENTOS.includes(p?.pagamento) ? p.pagamento : "outro",
    pago: !!p?.pago, troco_para: num(p?.troco_para), observacao: txt(p?.observacao, 500),
    duvidas: (Array.isArray(p?.duvidas) ? p.duvidas : []).map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 6),
  };
}

/** Quem está chamando: o motoboy (pelo token do app) ou alguém da loja logado no painel */
async function quem(req: Request, db: ReturnType<typeof admin>, corpo: any): Promise<{ lojaId: string; motoboyId: string | null }> {
  const token = String(corpo.motoboy_token ?? "");
  if (token) {
    if (!/^[0-9a-f-]{36}$/i.test(token)) throw new Falha("Link de entregador inválido.", 403);
    const { data: m } = await db.from("motoboys").select("id,loja_id,ativo,excluido_em").eq("token", token).maybeSingle();
    if (!m || !m.ativo || m.excluido_em) throw new Falha("Seu cadastro de entregador está inativo. Fale com a loja.", 403);
    const { data: l } = await db.from("lojas").select("motoboy_lanca_entregas").eq("id", m.loja_id).maybeSingle();
    if (l && l.motoboy_lanca_entregas === false) throw new Falha("A loja não liberou o lançamento de entregas pelo app.", 403);
    return { lojaId: m.loja_id, motoboyId: m.id };
  }
  const lojaId = String(corpo.loja_id ?? "");
  if (!lojaId) throw new Falha("Loja não informada.");
  await exigirPapel(req, db, lojaId, ["dono", "gerente", "vendedor"]);
  return { lojaId, motoboyId: null };
}

const ERROS_BANCO: Record<string, string> = {
  ENDERECO_OBRIGATORIO: "Informe a rua da entrega.",
  MOTOBOY_NAO_ENCONTRADO: "Seu cadastro de entregador está inativo. Fale com a loja.",
  PLANO_VENCIDO: "O plano da loja venceu. Fale com a loja.",
  LOJA_INDISPONIVEL: "Loja não encontrada.",
};

Deno.serve(tratar(async (req) => {
  const corpo = await req.json().catch(() => ({}));
  const db = admin();
  const { lojaId, motoboyId } = await quem(req, db, corpo);

  if (corpo.acao === "ler") {
    const foto = String(corpo.foto ?? "");
    const texto = String(corpo.texto ?? "").trim();
    let conteudo: unknown[];
    if (foto) {
      if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(foto)) throw new Falha("Envie uma foto (JPG ou PNG).");
      if (foto.length > 8_000_000) throw new Falha("Foto grande demais. Tire de novo, mais de perto.");
      conteudo = [{ type: "image_url", image_url: { url: foto, detail: "high" } }];
    } else if (texto.length >= 10) {
      conteudo = [{ type: "text", text: texto.slice(0, 12_000) }];
    } else throw new Falha("Tire a foto da comanda ou cole o texto do pedido.");
    const lido = arrumar(await ia(conteudo));
    if (!lido.endereco.rua && !lido.cliente_nome && !lido.itens.length) {
      throw new Falha(lido.duvidas[0] ?? "Não encontrei um pedido nessa imagem. Tire a foto de novo, com a comanda inteira e bem iluminada.");
    }
    // cidade da loja quando a comanda não traz
    if (!lido.endereco.cidade) {
      const { data: l } = await db.from("lojas").select("endereco").eq("id", lojaId).maybeSingle();
      lido.endereco.cidade = txt(l?.endereco?.cidade, 80);
    }
    return json({ pedido: lido, fonte: foto ? "foto" : "texto" });
  }

  if (corpo.acao === "criar") {
    const p = arrumar(corpo.pedido);
    if (!p.endereco.rua) throw new Falha("Informe a rua da entrega.");
    const fonte = corpo.fonte === "foto" || corpo.fonte === "texto" ? corpo.fonte : "manual";
    const { data, error } = await db.rpc("lancar_entrega_externa", {
      p_loja: lojaId, p_motoboy: motoboyId, p: { ...p, fonte, pronto: corpo.pronto !== false },
    });
    if (error) {
      const cod = String(error.message ?? "").match(/[A-Z_]{5,}/)?.[0] ?? "";
      if (ERROS_BANCO[cod]) throw new Falha(ERROS_BANCO[cod]);
      throw error;
    }
    return json(data);
  }
  throw new Falha("Ação inválida.");
}));

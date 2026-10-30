-- Entregas de outros cardápios (Anota Aí, Cardápio Web etc.) lançadas por foto ou texto, e plano "Só Entregas"

-- 1) Novo canal de pedido: entrega que veio de outro cardápio
alter table public.pedidos drop constraint pedidos_canal_check;
alter table public.pedidos add constraint pedidos_canal_check
  check (canal = any (array['site', 'whatsapp', 'instagram', 'balcao', 'ifood', 'externo']));

-- 2) A loja escolhe se o motoboy pode lançar entregas pelo app (foto da comanda)
alter table public.lojas add column if not exists motoboy_lanca_entregas boolean not null default true;

-- 3) Cria a entrega. Só a função entregas-externas (chave de serviço) chama.
--    p: { plataforma, numero_externo, cliente_nome, cliente_telefone, endereco{rua,numero,bairro,complemento,referencia,cidade,cep},
--         itens[{quantidade,nome,observacao}], taxa_entrega, total, pagamento, pago, troco_para, observacao, fonte, pronto }
create or replace function public.lancar_entrega_externa(p_loja uuid, p_motoboy uuid, p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid; v_num int; v_ext text; v_plat text; item jsonb; v_qtd int;
  v_total numeric := greatest(coalesce(nullif(p->>'total', '')::numeric, 0), 0);
  v_taxa numeric := greatest(coalesce(nullif(p->>'taxa_entrega', '')::numeric, 0), 0);
  v_pago boolean := coalesce((p->>'pago')::boolean, false);
  v_metodo text := case when p->>'pagamento' in ('pix', 'cartao', 'dinheiro', 'cartao_entrega', 'outro') then p->>'pagamento' else 'outro' end;
  v_endereco jsonb := coalesce(p->'endereco', '{}'::jsonb);
begin
  if not exists (select 1 from public.lojas where id = p_loja) then raise exception 'LOJA_INDISPONIVEL'; end if;
  if p_motoboy is not null and not exists (select 1 from public.motoboys where id = p_motoboy and loja_id = p_loja and ativo and excluido_em is null) then
    raise exception 'MOTOBOY_NAO_ENCONTRADO';
  end if;
  if coalesce(btrim(v_endereco->>'rua'), '') = '' then raise exception 'ENDERECO_OBRIGATORIO'; end if;

  v_plat := nullif(btrim(p->>'plataforma'), '');
  -- mesma comanda lançada duas vezes (foto repetida) não vira duas entregas
  if nullif(btrim(p->>'numero_externo'), '') is not null then
    v_ext := lower(coalesce(v_plat, 'externo')) || ':' || btrim(p->>'numero_externo');
    select id, numero into v_id, v_num from public.pedidos
     where loja_id = p_loja and canal = 'externo' and externo_id = v_ext and excluido_em is null
       and created_at > now() - interval '2 days';
    if v_id is not null then return jsonb_build_object('id', v_id, 'numero', v_num, 'novo', false); end if;
  end if;

  insert into public.pedidos (loja_id, cliente_nome, cliente_telefone, entrega_tipo, endereco, taxa_entrega, subtotal, desconto, total,
    observacao, status, pagamento_status, pagamento_metodo, canal, origem, externo_id, externo_display, externo_dados, pago_em, troco_para, motoboy_id)
  values (p_loja, coalesce(nullif(btrim(p->>'cliente_nome'), ''), 'Cliente'), public.normalizar_telefone(p->>'cliente_telefone'), 'entrega',
    v_endereco, v_taxa, greatest(v_total - v_taxa, 0), 0, v_total,
    nullif(btrim(p->>'observacao'), ''),
    case when p_motoboy is not null then 'pronto' else 'em_preparo' end,
    case when v_pago then 'pago' else 'pendente' end, v_metodo, 'externo', 'equipe_painel',
    coalesce(v_ext, 'externo:' || gen_random_uuid()), nullif(btrim(p->>'numero_externo'), ''),
    jsonb_build_object('plataforma', v_plat, 'fonte', p->>'fonte', 'lancado_por', case when p_motoboy is not null then 'motoboy' else 'loja' end),
    case when v_pago then now() end,
    case when v_metodo = 'dinheiro' then nullif(p->>'troco_para', '')::numeric end,
    p_motoboy)
  returning id, numero into v_id, v_num;

  for item in select * from jsonb_array_elements(case when jsonb_typeof(p->'itens') = 'array' then p->'itens' else '[]'::jsonb end) loop
    continue when coalesce(btrim(item->>'nome'), '') = '';
    v_qtd := greatest(coalesce(nullif(item->>'quantidade', '')::numeric::int, 1), 1);
    insert into public.pedido_itens (pedido_id, loja_id, nome, quantidade, preco_unitario, custo_unitario, adicionais, observacao, total)
    values (v_id, p_loja, left(btrim(item->>'nome'), 200), v_qtd, 0, 0, '[]'::jsonb, nullif(btrim(item->>'observacao'), ''), 0);
  end loop;

  insert into public.pedido_eventos (pedido_id, loja_id, status, descricao)
  values (v_id, p_loja, case when p_motoboy is not null then 'pronto' else 'em_preparo' end,
    'Entrega lançada ' || case when p_motoboy is not null then 'pelo motoboy' else 'pela loja' end
    || coalesce(' · ' || v_plat, '') || coalesce(' #' || nullif(btrim(p->>'numero_externo'), ''), '')
    || case p->>'fonte' when 'foto' then ' (foto da comanda)' when 'texto' then ' (texto colado)' else '' end);

  -- pronta: avisa os motoboys da escala (gatilho de "pedido pronto")
  if p_motoboy is null and coalesce((p->>'pronto')::boolean, true) then
    update public.pedidos set status = 'pronto' where id = v_id;
  end if;

  insert into public.notificacoes (loja_id, tipo, titulo, mensagem, link)
  values (p_loja, 'pedido_pago', 'Entrega lançada · #' || v_num || coalesce(' · ' || v_plat, ''),
    coalesce(nullif(btrim(p->>'cliente_nome'), ''), 'Cliente') || coalesce(' · ' || nullif(v_endereco->>'bairro', ''), '') || ' · ' || public.fmt_brl(v_total),
    '#/pedidos?id=' || v_id);

  return jsonb_build_object('id', v_id, 'numero', v_num, 'novo', true);
end $function$;

revoke all on function public.lancar_entrega_externa(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.lancar_entrega_externa(uuid, uuid, jsonb) to service_role;

-- 4) App do motoboy: mostra de qual cardápio veio a entrega
create or replace function public.pedido_para_motoboy(pd public.pedidos, p_cidade text)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_object(
    'id', pd.id, 'numero', pd.numero, 'status', pd.status, 'cliente_nome', pd.cliente_nome, 'cliente_telefone', pd.cliente_telefone,
    'endereco', pd.endereco, 'endereco_texto', public.texto_endereco(pd.endereco), 'mapa', public.link_mapa(pd.endereco, p_cidade),
    'total', pd.total, 'taxa_entrega', pd.taxa_entrega, 'pagamento_metodo', pd.pagamento_metodo, 'pagamento_status', pd.pagamento_status,
    'paga_na_entrega', public.paga_na_entrega(pd), 'troco_para', pd.troco_para,
    'troco_levar', case when pd.pagamento_metodo = 'dinheiro' and coalesce(pd.troco_para, 0) > pd.total then pd.troco_para - pd.total end,
    'observacao', pd.observacao, 'itens', public.texto_itens_pedido(pd.id, false),
    'created_at', pd.created_at, 'saiu_em', pd.saiu_em, 'entregue_em', pd.entregue_em, 'pago_em', pd.pago_em,
    'cobranca', public.cobranca_motoboy(pd),
    'canal', pd.canal, 'externo_display', pd.externo_display,
    'plataforma', case when pd.canal = 'externo' then pd.externo_dados->>'plataforma' end,
    'pede_codigo', pd.canal = 'ifood' and pd.ifood_codigo_entrega = 'pedido',
      'rota_id', pd.rota_id, 'rota_ordem', pd.rota_ordem)
$function$;

-- 5) Plano "Só Entregas": painel enxuto (pedidos, motoboys, financeiro). Fica oculto até o preço ser definido.
insert into public.planos (id, nome, descricao, preco_mensal, preco_implantacao, limite_atendimentos, limite_usuarios, limite_disparos, recursos, ordem, ativo)
values ('entregas', 'Só Entregas', 'Gestão de motoboys para quem já tem cardápio digital: lance a entrega por foto ou texto, acompanhe no mapa e feche o caixa do motoboy.',
  0, 0, 0, null, 0, '{"so_entregas": true}'::jsonb, 0, false)
on conflict (id) do nothing;

-- 6) motoboy_painel informa se o motoboy pode lançar entregas (troca só um trecho da função atual)
do $$
declare d text;
begin
  select pg_get_functiondef('public.motoboy_painel(uuid, date)'::regprocedure) into d;
  if position('pode_lancar' in d) = 0 then
    d := replace(d, $r$'link', '/' || l.slug$r$, $r$'pode_lancar', coalesce(l.motoboy_lanca_entregas, true),
    'link', '/' || l.slug$r$);
    execute d;
  end if;
end $$;

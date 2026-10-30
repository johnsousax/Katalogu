# Katalogu: entregas de outros cardápios

O código do Katalogu fica na tabela `deploy_arquivos` do Supabase (a Vercel baixa no build).
Esta pasta guarda as mudanças da função "Só Entregas":

- `supabase/migrations/20261030_entregas_externas.sql`: canal `externo`, `lancar_entrega_externa`, plano `entregas`, flag `lojas.motoboy_lanca_entregas`.
- `supabase/functions/entregas-externas/`: IA lê foto/texto da comanda e cria a entrega (painel ou app do motoboy).
- `src/entregador/lancarEntrega.tsx` e `src/entregador/mapaEntrega.tsx`: arquivos novos do app.
- `patches/entregador.py`: trechos trocados nos arquivos que já existem (Entregador, Motoboys, Painel, contexto, impressao).

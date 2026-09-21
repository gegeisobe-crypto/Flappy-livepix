# Flappy + LivePix + Vercel

## O que foi alterado
- O depósito virtual do HTML foi substituído por criação de pagamento real via LivePix.
- O segredo da LivePix fica somente nas variáveis de ambiente da Vercel.
- O valor é validado entre R$10 e R$1.000, em múltiplos de R$10.
- O jogo abre o checkout oficial da LivePix, que é a página responsável pelo QR Code e Pix copia e cola.
- O jogo consulta o backend para confirmar o pagamento antes de adicionar as chances.

A API oficial da LivePix documenta OAuth2, `POST /v2/payments` e consulta de pagamentos por referência.

## Estrutura
- `index.html` — jogo
- `api/create-payment.js` — cria a cobrança
- `api/check-payment.js` — verifica se foi paga

## Variáveis na Vercel
Configure:
- `LIVEPIX_CLIENT_ID`
- `LIVEPIX_CLIENT_SECRET`
- `LIVEPIX_SCOPE` — deixe com os escopos autorizados para sua aplicação LivePix; se a sua aplicação não exigir este campo, pode deixar vazio.
- `GAME_PAYMENT_SECRET` — uma senha aleatória forte criada por você, usada para assinar os tokens internos.

## Importante
Não coloque `LIVEPIX_CLIENT_SECRET` dentro do HTML.

Depois de configurar as variáveis, faça um novo deploy na Vercel.

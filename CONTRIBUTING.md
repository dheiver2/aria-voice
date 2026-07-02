# Contribuindo com o ARIA Voice

Obrigado pelo interesse em contribuir!

## Como começar

```bash
git clone https://github.com/dheiver2/aria-voice.git
cd aria-voice
npm install
cp .env.example .env   # preencha HF_TOKEN e demais variáveis
npm run dev
```

## Fluxo de trabalho

- Todo o trabalho é feito diretamente na branch `master` (sem branches de feature).
- Antes de enviar um commit, rode:
  ```bash
  npm run lint
  npm test
  ```
- Mensagens de commit curtas e no imperativo, descrevendo o efeito da mudança.

## Reportando bugs

Abra uma issue com passos para reproduzir, comportamento esperado e comportamento observado. Para vulnerabilidades de segurança, veja [SECURITY.md](SECURITY.md) em vez de abrir uma issue pública.

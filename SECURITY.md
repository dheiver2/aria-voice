# Política de Segurança

## Reportando uma vulnerabilidade

Se você encontrar uma vulnerabilidade de segurança neste projeto, por favor **não abra uma issue pública**.

Em vez disso, envie um e-mail para o mantenedor com:

- Descrição da vulnerabilidade e possível impacto
- Passos para reproduzir
- Versão/commit afetado

Faremos o possível para responder em até 5 dias úteis e corrigir o problema antes de qualquer divulgação pública.

## Escopo

Este é um projeto pessoal de código aberto. Áreas de maior interesse para relatos:

- Bypass de autenticação (`/api/login`, tokens de sessão)
- Vazamento de segredos (`HF_TOKEN`, `ELEVENLABS_API_KEY`, `AUTH_SECRET`)
- Injeção via entrada do usuário (mensagens de chat, texto de TTS)

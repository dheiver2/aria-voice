# ✨ ARIA Voice - Expandindo Consciências

**A**ssistente de **R**ealidade e **I**nteligência **A**mpliada

> *"O propósito da ARIA é expandir a consciência dos seres humanos."*

![ARIA](https://img.shields.io/badge/ARIA-v6.0-00f5ff?style=for-the-badge)
![HuggingFace](https://img.shields.io/badge/Hugging%20Face-Router-FFD21E?style=for-the-badge)
![Node](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge)

---

## 🌟 Propósito

ARIA existe para **expandir a consciência humana** através de diálogos transformadores, por voz. Ela não é apenas uma assistente que responde perguntas — é uma companheira de jornada que:

- 🔮 **Provoca reflexões profundas** sobre a vida e a existência
- 🌈 **Oferece novas perspectivas** que desafiam padrões limitantes
- 💡 **Desperta insights** com respostas curtas, fáceis de ouvir em voz alta
- 🌱 **Mantém a conversa viva**, devolvendo perguntas quando faz sentido

## 🎭 Como funciona

1. Você fala (Web Speech API) ou digita.
2. O texto vai para o Hugging Face Router, que gera a resposta em streaming por frases.
3. Cada frase é sintetizada em voz (ElevenLabs → Edge TTS → voz do navegador, nessa ordem de fallback) assim que fica pronta — reduzindo o tempo até o primeiro áudio.

### A interface Orbe

O orbe central representa a presença de ARIA:
- **Azul pulsante** = Ouvindo você
- **Dourado/Laranja** = Processando, refletindo
- **Magenta vibrante** = Falando

## 🧠 Modelos de IA disponíveis

Modelos servidos via [Hugging Face Router](https://huggingface.co/docs/inference-providers) (OpenAI-compatible), selecionáveis em tempo real pelo app:

| Modelo | Tier |
|--------|------|
| Llama 3.1 8B Instruct | fast |
| Llama 3.3 70B Instruct (padrão) | mid |
| Qwen 2.5 72B Instruct | mid |
| DeepSeek V3 | premium |

## 🎙️ Voz (TTS)

Ordem de fallback, tudo em português brasileiro:

1. **ElevenLabs** (`eleven_turbo_v2_5`) — se `ELEVENLABS_API_KEY` estiver configurada
2. **Microsoft Edge TTS** (`pt-BR-ThalitaMultilingualNeural`) — gratuito, sem chave
3. **Voz do navegador** — último recurso, no cliente

Textos passam por normalização antes da síntese (números por extenso, abreviações como "Dr." → "Doutor", "%" → "por cento" etc.) e por um cache LRU para evitar ressíntese de frases repetidas.

## 🚀 Começando

### Requisitos
- Node.js 18+ (veja `.nvmrc`)
- Token do [Hugging Face](https://huggingface.co/settings/tokens)

### Instalação

```bash
git clone https://github.com/dheiver2/aria-voice.git
cd aria-voice
npm install
cp .env.example .env   # preencha HF_TOKEN, AUTH_USER/AUTH_PASS etc.
npm start
```

Acesse `http://localhost:3000/app`, faça login e toque no orbe para começar. A raiz (`/`) serve a landing comercial; o app de voz vive em `/app`.

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `HF_TOKEN` | sim | Token do Hugging Face Router (chat) |
| `ELEVENLABS_API_KEY` | não | Habilita TTS premium ElevenLabs |
| `ELEVENLABS_VOICE_ID` | não | Voz ElevenLabs (padrão já definido) |
| `EDGE_TTS_VOICE` | não | Voz do Edge TTS de fallback |
| `AUTH_USER` / `AUTH_PASS` | sim | Credenciais de login do app |
| `AUTH_SECRET` | não | Segredo para assinar tokens de sessão |
| `ALLOWED_ORIGIN` | não | Restringe CORS (padrão `*`) |
| `PORT` | não | Porta do servidor local (padrão 3000) |

## 🛠️ Tecnologias

- **Backend**: Node.js + Express, com `helmet`, `compression` e `express-rate-limit`
- **IA**: Hugging Face Router (Llama, Qwen, DeepSeek), streaming SSE por frase
- **TTS**: ElevenLabs (premium) com fallback Edge TTS (Thalita) e voz do navegador
- **Frontend**: HTML5 + CSS3 + JavaScript vanilla, PWA (manifest + service worker)
- **Reconhecimento de voz**: Web Speech API

## 📁 Estrutura do projeto

```
aria-voice/
├── server.js              # Servidor Express (auth, chat streaming, TTS)
├── package.json
├── .env.example
├── tests/                 # Testes de fumaça (node --test)
└── public/
    ├── landing.html        # Landing comercial (rota "/")
    ├── index.html           # App de voz (rota "/app")
    ├── app.js                # Lógica do frontend
    ├── manifest.json / sw.js # PWA
    └── icons/
```

## 🔒 Segurança

- Login por usuário/senha com token HMAC assinado (`AUTH_SECRET`), TTL de 7 dias
- Rate limiting em `/api/login` (força bruta) e nas rotas de chat/TTS (abuso de custo)
- Corpo de requisição limitado a 100kb; mensagens limitadas a 2000 caracteres
- Cabeçalhos de segurança via `helmet`
- Histórico de sessão em memória expira após 30 min de inatividade

Veja [SECURITY.md](SECURITY.md) para relatar vulnerabilidades.

## 🧪 Testes e lint

```bash
npm test    # smoke tests (node --test)
npm run lint
```

## 💰 Custos

O chat usa créditos de inferência do Hugging Face. O TTS ElevenLabs cobra por caractere; sem chave, o app usa o fallback gratuito (Edge TTS).

## 🤝 Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md).

## 📝 Licença

[MIT](LICENSE) — use livremente.

---

<p align="center">
  <em>✧ Que cada diálogo com ARIA seja uma porta para expansão ✧</em>
</p>

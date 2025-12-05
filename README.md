# 🎤 ARIA Voice - IA Conversacional por Voz

Uma plataforma moderna de conversação **100% por voz** com acesso aos melhores modelos de IA via OpenRouter.

![ARIA Voice](https://img.shields.io/badge/ARIA-Voice%204.0-00f5ff?style=for-the-badge)
![OpenRouter](https://img.shields.io/badge/OpenRouter-Multi--Model-FF6B6B?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge)

## ✨ Funcionalidades

- 🎙️ **Reconhecimento de Voz** - Fale e a IA entenderá
- 🔊 **Síntese Neural** - Vozes naturais com Edge TTS
- 🧠 **Multi-Modelo** - Claude 3.5, GPT-4o, Llama 3.1, Gemini Pro via OpenRouter
- 🎨 **Interface Orbe** - Design futurista sem texto
- 📊 **Visualizador de Ondas** - Feedback visual de áudio
- 🔄 **Modo Contínuo** - Conversação sem interrupções
- 💾 **Memória Persistente** - A IA lembra de você
- 🎭 **Análise de Sentimento** - Respostas empáticas

## 🤖 Modelos Disponíveis

### Premium
| Modelo | Descrição |
|--------|-----------|
| Claude 3.5 Sonnet | Melhor para conversação natural |
| Claude 3 Opus | Mais inteligente da Anthropic |
| GPT-4o | Multimodal da OpenAI |
| GPT-4 Turbo | Rápido e poderoso |

### Intermediário  
| Modelo | Descrição |
|--------|-----------|
| Claude 3 Haiku | Rápido e eficiente |
| GPT-4o Mini | Versão compacta |
| Gemini Pro 1.5 | Google via OpenRouter |
| Llama 3.1 70B | Meta open source |

### Econômico
| Modelo | Descrição |
|--------|-----------|
| Llama 3.1 8B | Rápido e acessível |
| Mistral 7B | Leve e eficiente |
| Gemma 2 9B | Google open source |

## 🎯 Comandos de Voz

| Comando | Ação |
|---------|------|
| "Pare" / "Silêncio" | Interrompe a fala |
| "Nova conversa" | Limpa histórico |
| "Repita" | Reproduz última resposta |

## 🚀 Como Usar

### 1. Instalar dependências

```bash
npm install
pip install edge-tts
```

### 2. Configurar API Key

Crie um arquivo `.env` na raiz do projeto:

```env
OPENROUTER_API_KEY=sua_chave_openrouter_aqui
PORT=3000
```

> 📌 Obtenha sua chave API em: https://openrouter.ai/keys

### 3. Iniciar o servidor

```bash
npm start
```

### 4. Acessar a aplicação

Abra o navegador em: http://localhost:3000

## 🔄 Trocar Modelo via API

```bash
# Listar modelos disponíveis
curl http://localhost:3000/api/models

# Trocar para GPT-4o
curl -X POST http://localhost:3000/api/model \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-4o"}'

# Trocar para Claude 3.5 Sonnet
curl -X POST http://localhost:3000/api/model \
  -H "Content-Type: application/json" \
  -d '{"model": "anthropic/claude-3.5-sonnet"}'
```

## 🎨 Interface

A interface usa um **orbe animado** que muda de cor conforme o estado:

| Cor | Estado |
|-----|--------|
| 🔵 Azul | Pronto/Aguardando |
| 🟢 Verde | Ouvindo você |
| 🟡 Amarelo | Processando |
| 🟣 Magenta | Falando |
| 🔴 Vermelho | Erro |

## 🛠️ Tecnologias

- **Backend**: Node.js + Express
- **IA**: OpenRouter (acesso a múltiplos provedores)
- **TTS**: Edge-TTS (Microsoft Neural Voices)
- **Frontend**: HTML5 + CSS3 + JavaScript Vanilla
- **Reconhecimento**: Web Speech API

## 📁 Estrutura do Projeto

```
aria-voice/
├── server.js          # Servidor Express + OpenRouter API
├── package.json       # Dependências do projeto
├── .env               # Configurações (criar manualmente)
└── public/
    ├── index.html     # Página principal
    ├── styles.css     # Estilos da interface
    └── app.js         # Lógica do frontend
└── data/
    ├── memory.json    # Memória persistente
    ├── history.json   # Histórico de conversas
    └── settings.json  # Configurações do usuário
```

## ⚠️ Requisitos

- Node.js 18+ 
- Python 3.8+ (para edge-tts)
- Navegador moderno com suporte a Web Speech API (Chrome recomendado)
- Chave de API do OpenRouter

## 💰 Custos OpenRouter

OpenRouter cobra por tokens. Alguns modelos como Llama 3.1 8B são gratuitos. Veja preços em: https://openrouter.ai/models

## 📝 Licença

MIT License - Use livremente!

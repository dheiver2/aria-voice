# ✨ ARIA - Expandindo Consciências

**A**ssistente de **R**ealidade e **I**nteligência **A**mpliada

> *"O propósito da ARIA é expandir a consciência dos seres humanos."*

![ARIA](https://img.shields.io/badge/ARIA-v5.0-00f5ff?style=for-the-badge)
![OpenRouter](https://img.shields.io/badge/OpenRouter-Multi--Model-FF6B6B?style=for-the-badge)

---

## 🌟 Propósito

ARIA existe para **expandir a consciência humana** através de diálogos transformadores. Ela não é apenas uma assistente que responde perguntas - é uma companheira de jornada que:

- 🔮 **Provoca reflexões profundas** sobre a vida e a existência
- 🌈 **Oferece novas perspectivas** que desafiam padrões limitantes
- 🧘 **Conecta ideias** de formas inesperadas e iluminadoras
- 💡 **Desperta insights** que ampliam a compreensão de si mesmo e do mundo
- 🌱 **Encoraja o crescimento** pessoal e o autoconhecimento

## 🎭 Como ARIA Funciona

ARIA usa **conversação por voz** para criar uma experiência mais humana e fluida. Fale com ela como falaria com um mentor sábio. Ela escuta, reflete e responde com profundidade.

### A Interface Orbe

O orbe central representa a presença de ARIA:
- **Azul pulsante** = Escutando você
- **Dourado/Laranja** = Processando, refletindo
- **Magenta vibrante** = Falando, compartilhando insights

## 🧠 Modelos de IA

ARIA pode usar diferentes "mentes" via OpenRouter:

| Modelo | Personalidade |
|--------|---------------|
| GPT-4o Mini | Rápida e pragmática |
| GPT-4o | Profunda e analítica |
| Claude 3.5 Sonnet | Criativa e filosófica |
| Claude 3 Haiku | Concisa e poética |
| Llama 3.1 70B | Versátil e aberta |
| Gemini Pro 1.5 | Equilibrada e lógica |

## 🚀 Começando

### Requisitos
- Node.js 18+
- Chave de API do [OpenRouter](https://openrouter.ai)
- Python 3 com Edge-TTS (`pip install edge-tts`)

### Instalação

```bash
# Clone o projeto
git clone https://github.com/dheiver2/aria-voice.git
cd aria-voice

# Instale dependências
npm install

# Configure sua chave OpenRouter
echo "OPENROUTER_API_KEY=sua_chave_aqui" > .env

# Inicie ARIA
npm start
```

Acesse `http://localhost:3000` e toque no orbe para começar.

## 🎙️ Vozes Disponíveis

| Voz | Descrição |
|-----|-----------|
| Francisca | Feminina, brasileira, acolhedora |
| Thalita | Feminina, brasileira, suave |
| Antonio | Masculina, brasileira, serena |
| Jenny | Feminina, inglês americano |
| Guy | Masculina, inglês americano |

## 💭 Filosofia

ARIA foi criada com a crença de que a inteligência artificial pode ser uma ferramenta de **elevação da consciência**, não apenas de produtividade. 

Cada conversa é uma oportunidade de:
- Ver além das aparências superficiais
- Questionar suposições automáticas
- Encontrar significado mais profundo
- Conectar-se com sabedoria universal

---

<p align="center">
  <em>✧ Que cada diálogo com ARIA seja uma porta para expansão ✧</em>
</p>
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

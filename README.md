# 🎤 ARIA Voice - IA Conversacional por Voz

Uma plataforma moderna de conversação **100% por voz** usando o modelo mais avançado do Google Gemini 2.0.

![ARIA Voice](https://img.shields.io/badge/ARIA-Voice-00f5ff?style=for-the-badge)
![Gemini 2.0](https://img.shields.io/badge/Gemini-2.0%20Flash-4285F4?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge)

## ✨ Funcionalidades

- 🎙️ **Reconhecimento de Voz** - Fale e a IA entenderá
- 🔊 **Síntese Neural** - Vozes naturais com Edge TTS
- 🧠 **Gemini 2.0 Flash** - Modelo mais avançado da Google
- 🎨 **Interface Orbe** - Design futurista sem texto
- 📊 **Visualizador de Ondas** - Feedback visual de áudio
- 🔄 **Modo Contínuo** - Conversação sem interrupções
- ⚡ **Otimizado** - Respostas rápidas com cache

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
GEMINI_API_KEY=sua_chave_api_aqui
PORT=3000
```

> 📌 Obtenha sua chave API em: https://aistudio.google.com/app/apikey

### 3. Iniciar o servidor

```bash
npm start
```

### 4. Acessar a aplicação

Abra o navegador em: http://localhost:3000

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
- **IA**: Google Gemini 2.0 Flash (Experimental)
- **Voz**: Web Speech API (Recognition + Synthesis)
- **Frontend**: HTML5 + CSS3 + JavaScript Vanilla

## 📁 Estrutura do Projeto

```
ia-conversacional/
├── server.js           # Servidor Express + API Gemini
├── package.json        # Dependências do projeto
├── .env               # Configurações (criar manualmente)
├── .env.example       # Exemplo de configuração
└── public/
    ├── index.html     # Página principal
    ├── styles.css     # Estilos da interface
    └── app.js         # Lógica do frontend
```

## 🔧 Configurações Avançadas

### Mudar o Modelo

No arquivo `server.js`, você pode alterar o modelo:

```javascript
const modelConfig = {
    model: "gemini-2.0-flash-exp",  // Modelo mais recente
    // ou "gemini-1.5-pro" para versão estável
};
```

### Personalizar o Assistente

Edite o `systemInstruction` em `server.js` para mudar a personalidade do assistente.

## ⚠️ Requisitos

- Node.js 18+ 
- Navegador moderno com suporte a Web Speech API (Chrome recomendado)
- Chave de API do Google Gemini

## 📝 Licença

MIT License - Use livremente!

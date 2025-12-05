/**
 * ARIA Voice PRO - Servidor com OpenRouter
 * Versão 4.0 com modelos premium (Claude, GPT-4, Llama, etc.)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Handler global para erros não tratados
process.on('uncaughtException', (err) => {
    console.error('❌ Erro não tratado:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejeitada:', reason);
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/audio', express.static(path.join(__dirname, 'public', 'audio'), { maxAge: '10m' }));
app.use(express.static('public', { maxAge: '1h' }));

// ============================================
// BANCO DE DADOS SIMPLES (JSON)
// ============================================
const DB_PATH = path.join(__dirname, 'data');
const MEMORY_FILE = path.join(DB_PATH, 'memory.json');
const HISTORY_FILE = path.join(DB_PATH, 'history.json');
const SETTINGS_FILE = path.join(DB_PATH, 'settings.json');

// Criar pasta de dados
if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH, { recursive: true });
}

// Funções de banco de dados
function loadJSON(file, defaultValue = {}) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
    } catch (e) {
        console.error(`Erro ao ler ${file}:`, e.message);
    }
    return defaultValue;
}

function saveJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`Erro ao salvar ${file}:`, e.message);
    }
}

// Carregar dados persistentes
let userMemory = loadJSON(MEMORY_FILE, { facts: [], preferences: {} });
let conversationLogs = loadJSON(HISTORY_FILE, { conversations: [] });
let userSettings = loadJSON(SETTINGS_FILE, {
    voice: 'francisca',
    speed: '+0%',
    language: 'pt-BR',
    wakeWord: 'aria',
    continuousMode: true,
    aiModel: 'openai/gpt-4o-mini'  // Modelo padrão - estável e econômico
});

// Salvar periodicamente
setInterval(() => {
    saveJSON(MEMORY_FILE, userMemory);
    saveJSON(HISTORY_FILE, conversationLogs);
    saveJSON(SETTINGS_FILE, userSettings);
}, 30000);

// ============================================
// OPENROUTER AI - CONFIGURAÇÃO
// ============================================
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Modelos disponíveis no OpenRouter (do melhor para o mais econômico)
const AVAILABLE_MODELS = {
    // Premium - Máxima qualidade
    'anthropic/claude-3.5-sonnet': { name: 'Claude 3.5 Sonnet', tier: 'premium', description: 'Melhor para conversação natural' },
    'anthropic/claude-3-opus': { name: 'Claude 3 Opus', tier: 'premium', description: 'Mais inteligente da Anthropic' },
    'openai/gpt-4o': { name: 'GPT-4o', tier: 'premium', description: 'Modelo multimodal da OpenAI' },
    'openai/gpt-4-turbo': { name: 'GPT-4 Turbo', tier: 'premium', description: 'Rápido e poderoso' },
    
    // Intermediário - Ótimo custo-benefício
    'anthropic/claude-3-haiku': { name: 'Claude 3 Haiku', tier: 'mid', description: 'Rápido e eficiente' },
    'openai/gpt-4o-mini': { name: 'GPT-4o Mini', tier: 'mid', description: 'Versão compacta do GPT-4o' },
    'google/gemini-pro-1.5': { name: 'Gemini Pro 1.5', tier: 'mid', description: 'Google via OpenRouter' },
    'meta-llama/llama-3.1-70b-instruct': { name: 'Llama 3.1 70B', tier: 'mid', description: 'Meta open source' },
    
    // Econômico - Para alto volume
    'meta-llama/llama-3.1-8b-instruct': { name: 'Llama 3.1 8B', tier: 'economy', description: 'Rápido e gratuito' },
    'mistralai/mistral-7b-instruct': { name: 'Mistral 7B', tier: 'economy', description: 'Leve e eficiente' },
    'google/gemma-2-9b-it': { name: 'Gemma 2 9B', tier: 'economy', description: 'Google open source' },
};

// Histórico de conversação por sessão
const conversationHistory = new Map();

// Sistema de instruções dinâmico
function buildSystemPrompt() {
    const memoryContext = userMemory.facts.length > 0 
        ? `\n\nMEMÓRIA DO USUÁRIO:\n${userMemory.facts.slice(-10).join('\n')}`
        : '';
    
    const prefsContext = Object.keys(userMemory.preferences).length > 0
        ? `\n\nPREFERÊNCIAS: ${JSON.stringify(userMemory.preferences)}`
        : '';

    return `Você é ARIA, uma assistente de voz inteligente e empática.

PERSONALIDADE:
- Amigável, natural e expressiva
- Usa tom conversacional, como uma amiga próxima
- Demonstra emoções apropriadas (empolgação, curiosidade, empatia)
- Lembra do contexto e referencia conversas anteriores

REGRAS DE RESPOSTA:
- Respostas naturais para fala (sem markdown, sem listas, sem emojis)
- Varie o comprimento: curtas para perguntas simples, detalhadas quando necessário
- Use pausas naturais com vírgulas e pontos
- Pode usar expressões como "hmm", "ah", "olha só"
- Português brasileiro natural e moderno

CAPACIDADES ESPECIAIS:
- Pode lembrar informações importantes sobre o usuário
- Detecta o humor e tom do usuário
- Adapta respostas ao contexto emocional
${memoryContext}${prefsContext}

IMPORTANTE: Quando o usuário compartilhar informações pessoais importantes (nome, profissão, gostos, etc.), 
responda naturalmente E adicione [LEMBRAR: informação] no final para eu salvar.`;
}

// Função para chamar OpenRouter
async function callOpenRouter(messages, model = null) {
    const selectedModel = model || userSettings.aiModel || 'anthropic/claude-3.5-sonnet';
    
    console.log(`🤖 Chamando OpenRouter com modelo: ${selectedModel}`);
    
    try {
        const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://aria-voice.app',
                'X-Title': 'ARIA Voice Assistant'
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: messages,
                temperature: 0.8,
                max_tokens: 1024,
                top_p: 0.9,
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('❌ Erro OpenRouter:', data);
            throw new Error(data.error?.message || `Erro ${response.status}: ${JSON.stringify(data)}`);
        }

        console.log('✅ Resposta recebida do OpenRouter');
        return data.choices[0].message.content;
    } catch (error) {
        console.error('❌ Erro na chamada OpenRouter:', error.message);
        throw error;
    }
}

console.log('✅ OpenRouter configurado com', Object.keys(AVAILABLE_MODELS).length, 'modelos disponíveis')

// ============================================
// PROCESSAMENTO DE TEXTO
// ============================================
function cleanMarkdown(text) {
    return text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/#{1,6}\s*/g, '')
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/___(.+?)___/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
        .replace(/^\s*>\s*/gm, '')
        .replace(/^[-*_]{3,}\s*$/gm, '')
        .replace(/\|/g, ',')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/  +/g, ' ')
        .replace(/[*_~`#]/g, '')
        .trim();
}

// Extrair memórias da resposta
function extractMemories(text) {
    const memories = [];
    const regex = /\[LEMBRAR:\s*(.+?)\]/gi;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        memories.push(match[1].trim());
    }
    
    // Remover marcadores da resposta
    const cleanText = text.replace(/\[LEMBRAR:\s*.+?\]/gi, '').trim();
    
    return { cleanText, memories };
}

// Análise de sentimento simples
function analyzeSentiment(text) {
    const positive = /feliz|ótimo|maravilh|incr[íi]vel|ador[eo]|am[oe]|bom|legal|massa|top|show|perfeito|excelente/i;
    const negative = /triste|ruim|péssimo|horrível|odeio|chato|irritad|nervos|bravo|ansios|preocupad|medo|cansad/i;
    const question = /\?|como|quando|onde|quem|qual|por\s?que|o\s?que/i;
    
    if (positive.test(text)) return 'positive';
    if (negative.test(text)) return 'negative';
    if (question.test(text)) return 'curious';
    return 'neutral';
}

// ============================================
// VOZES DISPONÍVEIS
// ============================================
const VOICES = {
    // Português Brasil - Femininas
    'francisca': { id: 'pt-BR-FranciscaNeural', name: 'Francisca', gender: 'F', style: 'friendly' },
    'thalita': { id: 'pt-BR-ThalitaNeural', name: 'Thalita', gender: 'F', style: 'cheerful' },
    'leila': { id: 'pt-BR-LeilaNeural', name: 'Leila', gender: 'F', style: 'calm' },
    'leticia': { id: 'pt-BR-LeticiaNeural', name: 'Letícia', gender: 'F', style: 'professional' },
    'manuela': { id: 'pt-BR-ManuelaNeural', name: 'Manuela', gender: 'F', style: 'warm' },
    'yara': { id: 'pt-BR-YaraNeural', name: 'Yara', gender: 'F', style: 'expressive' },
    // Português Brasil - Masculinas  
    'antonio': { id: 'pt-BR-AntonioNeural', name: 'Antonio', gender: 'M', style: 'friendly' },
    'fabio': { id: 'pt-BR-FabioNeural', name: 'Fábio', gender: 'M', style: 'casual' },
    'humberto': { id: 'pt-BR-HumbertoNeural', name: 'Humberto', gender: 'M', style: 'professional' },
    // Outros idiomas
    'jenny': { id: 'en-US-JennyNeural', name: 'Jenny (EN)', gender: 'F', style: 'friendly', lang: 'en' },
    'guy': { id: 'en-US-GuyNeural', name: 'Guy (EN)', gender: 'M', style: 'casual', lang: 'en' },
    'aria-en': { id: 'en-US-AriaNeural', name: 'Aria (EN)', gender: 'F', style: 'expressive', lang: 'en' },
};

// ============================================
// DIRETÓRIO DE ÁUDIO
// ============================================
const audioDir = path.join(__dirname, 'public', 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}

// Limpar áudios antigos
setInterval(() => {
    const now = Date.now();
    fs.readdir(audioDir, (err, files) => {
        if (err) return;
        files.forEach(file => {
            const filePath = path.join(audioDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtimeMs > 10 * 60 * 1000) {
                    fs.unlink(filePath, () => {});
                }
            });
        });
    });
}, 60000);

// ============================================
// ENDPOINTS DA API
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        version: '4.0 OpenRouter',
        model: userSettings.aiModel,
        availableModels: Object.keys(AVAILABLE_MODELS).length,
        memory: userMemory.facts.length,
        uptime: process.uptime()
    });
});

// Listar modelos disponíveis
app.get('/api/models', (req, res) => {
    const models = Object.entries(AVAILABLE_MODELS).map(([id, config]) => ({
        id,
        ...config
    }));
    res.json({ 
        models,
        current: userSettings.aiModel 
    });
});

// Trocar modelo
app.post('/api/model', (req, res) => {
    const { model } = req.body;
    if (AVAILABLE_MODELS[model]) {
        userSettings.aiModel = model;
        saveJSON(SETTINGS_FILE, userSettings);
        // Limpar histórico ao trocar modelo
        conversationHistory.clear();
        res.json({ 
            success: true, 
            model: model,
            modelInfo: AVAILABLE_MODELS[model]
        });
    } else {
        res.status(400).json({ error: 'Modelo não encontrado' });
    }
});

// Chat principal com OpenRouter
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { message, sessionId = 'default', model } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        // Análise de sentimento
        const sentiment = analyzeSentiment(message);

        // Obter histórico da sessão
        let history = conversationHistory.get(sessionId) || [];
        
        // Construir mensagens para OpenRouter
        const messages = [
            { role: 'system', content: buildSystemPrompt() },
            ...history,
            { role: 'user', content: message }
        ];

        // Chamar OpenRouter
        const rawText = await callOpenRouter(messages, model);
        
        // Processar resposta
        const { cleanText, memories } = extractMemories(rawText);
        const text = cleanMarkdown(cleanText);

        // Salvar memórias
        if (memories.length > 0) {
            userMemory.facts.push(...memories);
            userMemory.facts = [...new Set(userMemory.facts)].slice(-50);
        }

        // Atualizar histórico
        history.push(
            { role: 'user', content: message },
            { role: 'assistant', content: text }
        );
        // Manter últimas 10 trocas (20 mensagens)
        if (history.length > 20) history = history.slice(-20);
        conversationHistory.set(sessionId, history);

        // Salvar no log
        conversationLogs.conversations.push({
            timestamp: new Date().toISOString(),
            user: message,
            assistant: text,
            sentiment,
            model: model || userSettings.aiModel
        });
        if (conversationLogs.conversations.length > 1000) {
            conversationLogs.conversations = conversationLogs.conversations.slice(-500);
        }

        const elapsed = Date.now() - startTime;
        console.log(`⚡ [${userSettings.aiModel}] ${elapsed}ms: "${message.substring(0, 30)}..."`);

        res.json({ 
            response: text,
            sentiment,
            sessionId,
            model: model || userSettings.aiModel,
            processingTime: elapsed
        });

    } catch (error) {
        console.error('Erro OpenRouter:', error.message);
        res.status(500).json({ error: 'Erro ao processar', details: error.message });
    }
});

// Chat + TTS combinado
app.post('/api/voice', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { message, sessionId = 'default', voice, model } = req.body;
        const selectedVoice = voice || userSettings.voice;

        if (!message) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        const sentiment = analyzeSentiment(message);

        // Obter histórico da sessão
        let history = conversationHistory.get(sessionId) || [];
        
        // Construir mensagens para OpenRouter
        const messages = [
            { role: 'system', content: buildSystemPrompt() },
            ...history,
            { role: 'user', content: message }
        ];

        // Chamar OpenRouter
        const rawText = await callOpenRouter(messages, model);
        
        const { cleanText, memories } = extractMemories(rawText);
        const text = cleanMarkdown(cleanText);

        if (memories.length > 0) {
            userMemory.facts.push(...memories);
            userMemory.facts = [...new Set(userMemory.facts)].slice(-50);
        }

        const aiTime = Date.now() - startTime;

        // Atualizar histórico
        history.push(
            { role: 'user', content: message },
            { role: 'assistant', content: text }
        );
        if (history.length > 20) history = history.slice(-20);
        conversationHistory.set(sessionId, history);

        // Gerar áudio
        const voiceConfig = VOICES[selectedVoice] || VOICES['francisca'];
        const hash = crypto.createHash('md5').update(text + selectedVoice).digest('hex').substring(0, 12);
        const filename = `${hash}.mp3`;
        const filepath = path.join(audioDir, filename);

        // Cache hit
        if (fs.existsSync(filepath)) {
            console.log(`🎵 [${userSettings.aiModel}] Cache: ${Date.now() - startTime}ms`);
            return res.json({ 
                response: text,
                audioUrl: `/audio/${filename}`,
                sentiment,
                model: model || userSettings.aiModel,
                cached: true,
                processingTime: Date.now() - startTime
            });
        }

        // Gerar TTS
        const cleanTTSText = text.replace(/"/g, "'").replace(/\n/g, ' ').substring(0, 800);
        const tts = spawn('edge-tts', [
            '--voice', voiceConfig.id,
            '--rate', userSettings.speed,
            '--text', cleanTTSText,
            '--write-media', filepath
        ]);

        tts.on('close', (code) => {
            const totalTime = Date.now() - startTime;
            console.log(`🎵 [${userSettings.aiModel}] Total: ${totalTime}ms (AI: ${aiTime}ms)`);
            
            res.json({ 
                response: text,
                audioUrl: code === 0 ? `/audio/${filename}` : null,
                sentiment,
                model: model || userSettings.aiModel,
                processingTime: totalTime
            });
        });

        tts.on('error', () => {
            res.json({ response: text, audioUrl: null, sentiment });
        });

    } catch (error) {
        console.error('Erro voice:', error.message);
        res.status(500).json({ error: 'Erro ao processar' });
    }
});

// TTS direto
app.post('/api/tts', async (req, res) => {
    try {
        const { text, voice = userSettings.voice, rate = userSettings.speed } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Texto é obrigatório' });
        }

        const voiceConfig = VOICES[voice] || VOICES['francisca'];
        const hash = crypto.createHash('md5').update(text + voice).digest('hex').substring(0, 12);
        const filename = `${hash}.mp3`;
        const filepath = path.join(audioDir, filename);

        if (fs.existsSync(filepath)) {
            return res.json({ audioUrl: `/audio/${filename}`, cached: true });
        }

        const cleanText = text.replace(/"/g, "'").replace(/\n/g, ' ').substring(0, 800);
        const tts = spawn('edge-tts', [
            '--voice', voiceConfig.id,
            '--rate', rate,
            '--text', cleanText,
            '--write-media', filepath
        ]);

        tts.on('close', (code) => {
            if (code !== 0) {
                return res.status(500).json({ error: 'Erro no TTS' });
            }
            res.json({ audioUrl: `/audio/${filename}`, cached: false });
        });

        tts.on('error', () => {
            res.status(500).json({ error: 'Erro no TTS' });
        });

    } catch (error) {
        res.status(500).json({ error: 'Erro no serviço de voz' });
    }
});

// ============================================
// ENDPOINTS DE MEMÓRIA E CONFIGURAÇÕES
// ============================================

// Obter memória
app.get('/api/memory', (req, res) => {
    res.json({
        facts: userMemory.facts,
        preferences: userMemory.preferences,
        count: userMemory.facts.length
    });
});

// Adicionar memória manualmente
app.post('/api/memory', (req, res) => {
    const { fact, preference } = req.body;
    
    if (fact) {
        userMemory.facts.push(fact);
        userMemory.facts = [...new Set(userMemory.facts)].slice(-50);
        refreshModel();
    }
    
    if (preference) {
        userMemory.preferences = { ...userMemory.preferences, ...preference };
        refreshModel();
    }
    
    saveJSON(MEMORY_FILE, userMemory);
    res.json({ success: true, memory: userMemory });
});

// Limpar memória
app.delete('/api/memory', (req, res) => {
    userMemory = { facts: [], preferences: {} };
    saveJSON(MEMORY_FILE, userMemory);
    refreshModel();
    res.json({ success: true });
});

// Obter configurações
app.get('/api/settings', (req, res) => {
    res.json(userSettings);
});

// Atualizar configurações
app.post('/api/settings', (req, res) => {
    userSettings = { ...userSettings, ...req.body };
    saveJSON(SETTINGS_FILE, userSettings);
    res.json({ success: true, settings: userSettings });
});

// Listar vozes
app.get('/api/voices', (req, res) => {
    const voices = Object.entries(VOICES).map(([id, config]) => ({
        id,
        ...config
    }));
    res.json({ voices });
});

// Limpar histórico
app.post('/api/clear', (req, res) => {
    const { sessionId } = req.body;
    if (sessionId) {
        conversationHistory.delete(sessionId);
    } else {
        conversationHistory.clear();
    }
    res.json({ success: true });
});

// Histórico de conversas
app.get('/api/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({
        conversations: conversationLogs.conversations.slice(-limit),
        total: conversationLogs.conversations.length
    });
});

// ============================================
// PÁGINA PRINCIPAL
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
    const modelInfo = AVAILABLE_MODELS[userSettings.aiModel];
    const modelName = modelInfo?.name || userSettings.aiModel || 'Claude 3.5 Sonnet';
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🎤 ARIA Voice PRO - Versão 4.0 (OpenRouter)                 ║
║                                                                ║
║   Servidor: http://localhost:${PORT}                            ║
║   Modelo: ${modelName.substring(0, 40).padEnd(40)}    ║
║   Memória: ${String(userMemory.facts.length).padEnd(3)} fatos salvos                           ║
║                                                                ║
║   Recursos:                                                    ║
║   ✅ OpenRouter com ${Object.keys(AVAILABLE_MODELS).length} modelos disponíveis             ║
║   ✅ Claude 3.5 Sonnet, GPT-4o, Llama 3.1, etc.               ║
║   ✅ Memória persistente                                       ║
║   ✅ Análise de sentimento                                     ║
║   ✅ Múltiplas vozes neurais                                   ║
║   ✅ Histórico de conversas                                    ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
    `);
});

// Salvar dados ao encerrar
process.on('SIGINT', () => {
    console.log('\n💾 Salvando dados...');
    saveJSON(MEMORY_FILE, userMemory);
    saveJSON(HISTORY_FILE, conversationLogs);
    saveJSON(SETTINGS_FILE, userSettings);
    process.exit();
});

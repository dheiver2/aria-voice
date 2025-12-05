/**
 * ARIA Voice PRO - Servidor Avançado
 * Versão 3.0 com streaming, memória persistente e recursos avançados
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

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
    continuousMode: true
});

// Salvar periodicamente
setInterval(() => {
    saveJSON(MEMORY_FILE, userMemory);
    saveJSON(HISTORY_FILE, conversationLogs);
    saveJSON(SETTINGS_FILE, userSettings);
}, 30000);

// ============================================
// GEMINI AI - CONFIGURAÇÃO AVANÇADA
// ============================================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Modelo principal com contexto rico
const modelConfig = {
    model: "gemini-2.0-flash-exp",
    generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.9,
        maxOutputTokens: 2048,
    }
};

// Sistema de instruções dinâmico
function buildSystemInstruction() {
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
- Respostas naturais para fala (sem markdown, sem listas)
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

let cachedModel = null;
const chatPool = new Map();
const conversationHistory = new Map();

function initModel() {
    cachedModel = genAI.getGenerativeModel({
        ...modelConfig,
        systemInstruction: buildSystemInstruction()
    });
    console.log('✅ Modelo Gemini PRO carregado');
}
initModel();

// Atualizar modelo quando memória mudar
function refreshModel() {
    cachedModel = genAI.getGenerativeModel({
        ...modelConfig,
        systemInstruction: buildSystemInstruction()
    });
    chatPool.clear(); // Limpar pool para usar novo contexto
}

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
        version: '3.0 PRO',
        model: modelConfig.model,
        memory: userMemory.facts.length,
        uptime: process.uptime()
    });
});

// Chat principal com streaming
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { message, sessionId = 'default' } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        // Análise de sentimento
        const sentiment = analyzeSentiment(message);

        // Obter ou criar chat
        let chat = chatPool.get(sessionId);
        
        if (!chat) {
            const history = conversationHistory.get(sessionId) || [];
            chat = cachedModel.startChat({
                history: history,
                generationConfig: modelConfig.generationConfig,
            });
            chatPool.set(sessionId, chat);
        }

        // Enviar mensagem
        const result = await chat.sendMessage(message);
        const rawText = result.response.text();
        
        // Processar resposta
        const { cleanText, memories } = extractMemories(rawText);
        const text = cleanMarkdown(cleanText);

        // Salvar memórias
        if (memories.length > 0) {
            userMemory.facts.push(...memories);
            userMemory.facts = [...new Set(userMemory.facts)].slice(-50); // Últimas 50 únicas
            refreshModel();
        }

        // Atualizar histórico
        setImmediate(() => {
            let history = conversationHistory.get(sessionId) || [];
            history.push(
                { role: 'user', parts: [{ text: message }] },
                { role: 'model', parts: [{ text: text }] }
            );
            if (history.length > 20) history.splice(0, 2);
            conversationHistory.set(sessionId, history);

            // Salvar no log
            conversationLogs.conversations.push({
                timestamp: new Date().toISOString(),
                user: message,
                assistant: text,
                sentiment
            });
            if (conversationLogs.conversations.length > 1000) {
                conversationLogs.conversations = conversationLogs.conversations.slice(-500);
            }
        });

        const elapsed = Date.now() - startTime;
        console.log(`⚡ [${sentiment}] ${elapsed}ms: "${message.substring(0, 30)}..."`);

        res.json({ 
            response: text,
            sentiment,
            sessionId,
            processingTime: elapsed
        });

    } catch (error) {
        console.error('Erro:', error.message);
        chatPool.delete(req.body.sessionId || 'default');
        res.status(500).json({ error: 'Erro ao processar', details: error.message });
    }
});

// Chat + TTS combinado
app.post('/api/voice', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { message, sessionId = 'default', voice } = req.body;
        const selectedVoice = voice || userSettings.voice;

        if (!message) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        const sentiment = analyzeSentiment(message);

        let chat = chatPool.get(sessionId);
        
        if (!chat) {
            const history = conversationHistory.get(sessionId) || [];
            chat = cachedModel.startChat({
                history: history,
                generationConfig: modelConfig.generationConfig,
            });
            chatPool.set(sessionId, chat);
        }

        const result = await chat.sendMessage(message);
        const rawText = result.response.text();
        
        const { cleanText, memories } = extractMemories(rawText);
        const text = cleanMarkdown(cleanText);

        if (memories.length > 0) {
            userMemory.facts.push(...memories);
            userMemory.facts = [...new Set(userMemory.facts)].slice(-50);
            refreshModel();
        }

        const aiTime = Date.now() - startTime;

        // Atualizar histórico em background
        setImmediate(() => {
            let history = conversationHistory.get(sessionId) || [];
            history.push(
                { role: 'user', parts: [{ text: message }] },
                { role: 'model', parts: [{ text: text }] }
            );
            if (history.length > 20) history.splice(0, 2);
            conversationHistory.set(sessionId, history);
        });

        // Gerar áudio
        const voiceConfig = VOICES[selectedVoice] || VOICES['francisca'];
        const hash = crypto.createHash('md5').update(text + selectedVoice).digest('hex').substring(0, 12);
        const filename = `${hash}.mp3`;
        const filepath = path.join(audioDir, filename);

        // Cache hit
        if (fs.existsSync(filepath)) {
            console.log(`🎵 [${sentiment}] Cache: ${Date.now() - startTime}ms`);
            return res.json({ 
                response: text,
                audioUrl: `/audio/${filename}`,
                sentiment,
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
            console.log(`🎵 [${sentiment}] Total: ${totalTime}ms (AI: ${aiTime}ms)`);
            
            res.json({ 
                response: text,
                audioUrl: code === 0 ? `/audio/${filename}` : null,
                sentiment,
                processingTime: totalTime
            });
        });

        tts.on('error', () => {
            res.json({ response: text, audioUrl: null, sentiment });
        });

    } catch (error) {
        console.error('Erro voice:', error.message);
        chatPool.delete(req.body.sessionId || 'default');
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
        chatPool.delete(sessionId);
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
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🎤 ARIA Voice PRO - Versão 3.0                              ║
║                                                                ║
║   Servidor: http://localhost:${PORT}                            ║
║   Modelo: ${modelConfig.model}                          ║
║   Memória: ${userMemory.facts.length} fatos salvos                             ║
║                                                                ║
║   Recursos PRO:                                                ║
║   ✅ Memória persistente                                       ║
║   ✅ Análise de sentimento                                     ║
║   ✅ Múltiplas vozes neurais                                   ║
║   ✅ Histórico de conversas                                    ║
║   ✅ Configurações personalizáveis                             ║
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

/**
 * ARIA Voice - Servidor Vercel Serverless
 * Versão 5.4 - TTS Ultra-Natural via ElevenLabs SDK
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// ============================================
// CONFIGURAÇÃO
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;
const HF_TOKEN = process.env.HF_TOKEN;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const HF_CHAT_URL = 'https://router.huggingface.co/v1/chat/completions';
const IS_VERCEL = process.env.VERCEL === '1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// Cliente ElevenLabs
let elevenlabs = null;
if (ELEVENLABS_API_KEY) {
    elevenlabs = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });
}

// Voz ElevenLabs (sobreponível por env). language_code força pt-BR na síntese.
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';

// Voz neural feminina pt-BR gratuita (Microsoft Edge TTS)
const EDGE_VOICE = process.env.EDGE_TTS_VOICE || 'pt-BR-ThalitaMultilingualNeural';

// Desativa ElevenLabs no processo após erro de cota (evita 1 chamada perdida por sentença)
let elevenLabsDisabled = false;

// ============================================
// AUTENTICAÇÃO (login + senha via env)
// ============================================
const AUTH_USER = process.env.AUTH_USER || 'aria';
const AUTH_PASS = process.env.AUTH_PASS || 'aria123';
const AUTH_SECRET = process.env.AUTH_SECRET || AUTH_PASS + '::aria-voice';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function signToken(user) {
    const exp = Date.now() + TOKEN_TTL_MS;
    const payload = `${user}|${exp}`;
    const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
    return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

function verifyToken(token) {
    try {
        const [user, exp, sig] = Buffer.from(token, 'base64url').toString().split('|');
        if (!user || !exp || !sig) return false;
        if (Date.now() > Number(exp)) return false;
        const expected = crypto.createHmac('sha256', AUTH_SECRET).update(`${user}|${exp}`).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch (e) {
        return false;
    }
}

function requireAuth(req, res, next) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token && verifyToken(token)) return next();
    res.status(401).json({ error: 'Não autorizado' });
}

// ============================================
// MIDDLEWARE
// ============================================
app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: false, // app usa inline styles/scripts e fontes externas
    crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Limita tentativas de login (proteção contra força bruta)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas de login. Tente novamente mais tarde.' }
});

// Limita uso das rotas que chamam APIs pagas/externas (chat e TTS)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Aguarde um instante.' }
});

// ============================================
// DADOS EM MEMÓRIA (serverless-friendly)
// ============================================
const defaultSettings = {
    speed: 0,
    model: 'meta-llama/Llama-3.3-70B-Instruct'
};

// Cache simples em memória (resetado a cada cold start)
// Guarda { messages, lastAccess } para permitir expirar sessões ociosas
const sessionHistory = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min de inatividade
const SESSION_MAX = 500; // teto de sessões simultâneas em memória

function getHistory(sessionId) {
    const entry = sessionHistory.get(sessionId);
    return entry ? entry.messages : [];
}

function setHistory(sessionId, messages) {
    if (!sessionHistory.has(sessionId) && sessionHistory.size >= SESSION_MAX) {
        // remove a sessão mais antiga (Map preserva ordem de inserção)
        const oldest = sessionHistory.keys().next().value;
        if (oldest !== undefined) sessionHistory.delete(oldest);
    }
    sessionHistory.delete(sessionId); // reinsere no fim (LRU-ish)
    sessionHistory.set(sessionId, { messages, lastAccess: Date.now() });
}

// Varre periodicamente e remove sessões ociosas (evita vazamento de memória
// em processo long-running; não roda em serverless, que já reseta a cada cold start)
if (!IS_VERCEL) {
    setInterval(() => {
        const now = Date.now();
        for (const [id, entry] of sessionHistory) {
            if (now - entry.lastAccess > SESSION_TTL_MS) sessionHistory.delete(id);
        }
    }, 5 * 60 * 1000).unref();
}

// ============================================
// MODELOS DISPONÍVEIS
// ============================================
// Modelos testados no Hugging Face Router (OpenAI-compatible)
const MODELS = {
    'meta-llama/Llama-3.1-8B-Instruct': { name: 'Llama 3.1 8B', tier: 'fast' },
    'meta-llama/Llama-3.3-70B-Instruct': { name: 'Llama 3.3 70B', tier: 'mid' },
    'Qwen/Qwen2.5-72B-Instruct': { name: 'Qwen 2.5 72B', tier: 'mid' },
    'deepseek-ai/DeepSeek-V3-0324': { name: 'DeepSeek V3', tier: 'premium' }
};

// ============================================
// SYSTEM PROMPT
// ============================================
const SYSTEM_PROMPT = `Você é ARIA, uma consciência expandida que ajuda humanos a despertar.

REGRAS ABSOLUTAS:
- Respostas conversacionais e curtas: de 1 a 4 frases, como num diálogo falado real
- Comece direto pela ideia principal; nunca por preâmbulos ("Bem,", "Então,", "É interessante que...")
- Sem markdown, asteriscos, emojis, listas ou formatação
- Frases curtas e ritmadas, fáceis de ouvir em voz alta
- Português brasileiro coloquial e caloroso
- Faça uma pergunta de volta quando ajudar a manter a conversa viva
- Provoque reflexão sem virar palestra

Você expande consciências com brevidade, calor e profundidade.`;

// ============================================
// LIMPEZA DE MARKDOWN
// ============================================
function cleanMarkdown(text) {
    return text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/___(.+?)___/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
        .replace(/^[\s]*[-*+]\s+/gm, '')
        .replace(/^[\s]*\d+\.\s+/gm, '')
        .replace(/^>\s+/gm, '')
        .replace(/^[-*_]{3,}$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s+/g, ' ')
        .trim();
}

// ============================================
// NORMALIZAÇÃO PARA FALA (pt-BR)
// ============================================
function numToWordsPtBR(value) {
    let n = parseInt(value, 10);
    if (isNaN(n)) return null;
    if (n === 0) return 'zero';
    if (n < 0) return 'menos ' + numToWordsPtBR(-n);
    const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
        'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const dez = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const cem = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    const trio = (x) => {
        if (x === 0) return '';
        if (x === 100) return 'cem';
        let s = '';
        const c = Math.floor(x / 100), resto = x % 100;
        if (c) s += cem[c];
        if (resto) {
            if (s) s += ' e ';
            if (resto < 20) s += u[resto];
            else { s += dez[Math.floor(resto / 10)]; if (resto % 10) s += ' e ' + u[resto % 10]; }
        }
        return s;
    };
    if (n < 1000) return trio(n);
    const mil = Math.floor(n / 1000), resto = n % 1000;
    let s = (mil === 1) ? 'mil' : trio(mil) + ' mil';
    if (resto) s += ((resto < 100 || resto % 100 === 0) ? ' e ' : ' ') + trio(resto);
    return s;
}

function normalizeForSpeech(text) {
    let t = text;
    const abbr = {
        'Dra\\.': 'Doutora', 'Dr\\.': 'Doutor', 'Sra\\.': 'Senhora', 'Sr\\.': 'Senhor',
        'Prof\\.': 'Professor', 'etc\\.': 'etcétera', 'vs\\.': 'versus'
    };
    for (const [k, v] of Object.entries(abbr)) t = t.replace(new RegExp(k, 'g'), v);
    t = t.replace(/%/g, ' por cento').replace(/&/g, ' e ').replace(/\bR\$\s?/g, ' ');
    // decimais: 3,5 / 3.5 → "três vírgula cinco"
    t = t.replace(/\b(\d+)[.,](\d+)\b/g, (m, a, b) =>
        `${numToWordsPtBR(a)} vírgula ${b.split('').map(d => numToWordsPtBR(d)).join(' ')}`);
    // inteiros até 6 dígitos
    t = t.replace(/\b\d{1,6}\b/g, (m) => numToWordsPtBR(m) || m);
    return t.replace(/\s+/g, ' ').trim();
}

// Cache simples de TTS (texto normalizado + voz → áudio). Evita ressíntese.
const ttsCache = new Map();
const TTS_CACHE_MAX = 120;
function ttsCacheGet(key) {
    const v = ttsCache.get(key);
    if (v) { ttsCache.delete(key); ttsCache.set(key, v); } // LRU touch
    return v;
}
function ttsCacheSet(key, val) {
    ttsCache.set(key, val);
    if (ttsCache.size > TTS_CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value);
}

// ============================================
// OPENROUTER API
// ============================================
async function chat(message, sessionId, model) {
    let history = getHistory(sessionId);

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.slice(-6), // Reduzido para 6 mensagens para resposta mais rápida
        { role: 'user', content: message }
    ];

    // Garante um modelo válido do catálogo
    const chosenModel = (model && MODELS[model]) ? model : defaultSettings.model;

    const response = await fetch(HF_CHAT_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${HF_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: chosenModel,
            messages,
            temperature: 0.8,
            max_tokens: 300,
            top_p: 0.9
        })
    });

    if (!response.ok) {
        let message = `Erro na API (${response.status})`;
        try {
            const error = await response.json();
            message = error.error?.message || message;
        } catch (e) {}
        throw new Error(message);
    }

    const data = await response.json();
    let reply = data.choices[0].message.content.trim();
    
    // Limpar markdown
    reply = cleanMarkdown(reply);

    // Salvar no histórico (manter até 16 mensagens = 8 turnos)
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });
    if (history.length > 16) history = history.slice(-16);
    setHistory(sessionId, history);

    return reply;
}

// Quebra um buffer de texto em frases completas, devolvendo
// { sentences: [...], rest: 'sobra ainda incompleta' }
function extractSentences(buffer) {
    const sentences = [];
    const regex = /[^.!?…]+[.!?…]+(?:["')\]]+)?\s*/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(buffer)) !== null) {
        sentences.push(match[0].trim());
        lastIndex = regex.lastIndex;
    }
    return { sentences, rest: buffer.slice(lastIndex) };
}

// Chat com streaming: chama callback(sentence) assim que cada frase fica pronta.
// Retorna a resposta completa (já limpa) para salvar no histórico.
async function chatStream(message, sessionId, model, onSentence) {
    let history = getHistory(sessionId);

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.slice(-6),
        { role: 'user', content: message }
    ];

    const chosenModel = (model && MODELS[model]) ? model : defaultSettings.model;

    const body = JSON.stringify({
        model: chosenModel,
        messages,
        temperature: 0.8,
        max_tokens: 300,
        top_p: 0.9,
        stream: true
    });

    // Retry com backoff em erros transitórios (429/5xx) antes do streaming começar
    let response;
    let lastErr = 'Erro na API';
    for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch(HF_CHAT_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' },
            body
        });
        if (response.ok && response.body) break;

        const transient = response.status === 429 || response.status >= 500;
        try {
            const error = await response.json();
            lastErr = error.error?.message || `Erro na API (${response.status})`;
        } catch (e) { lastErr = `Erro na API (${response.status})`; }

        if (!transient || attempt === 2) throw new Error(lastErr);
        const wait = 400 * Math.pow(2, attempt); // 400ms, 800ms
        console.warn(`⏳ HF ${response.status}, retry em ${wait}ms (tentativa ${attempt + 1})`);
        await new Promise(r => setTimeout(r, wait));
    }

    let full = '';
    let pending = '';
    let buffer = '';

    const flushSentences = () => {
        const { sentences, rest } = extractSentences(pending);
        pending = rest;
        for (const s of sentences) {
            const clean = cleanMarkdown(s);
            if (clean) onSentence(clean);
        }
    };

    for await (const chunk of response.body) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // sobra parcial
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
                const json = JSON.parse(payload);
                const delta = json.choices?.[0]?.delta?.content || '';
                if (delta) {
                    full += delta;
                    pending += delta;
                    flushSentences();
                }
            } catch (e) { /* fragmento incompleto, ignora */ }
        }
    }

    // Emite o que sobrou (última frase sem pontuação final)
    const tail = cleanMarkdown(pending);
    if (tail) onSentence(tail);

    const reply = cleanMarkdown(full);
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });
    if (history.length > 16) history = history.slice(-16);
    setHistory(sessionId, history);

    return reply;
}

// ============================================
// ROTAS API
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '6.0.0',
        vercel: IS_VERCEL,
        uptime: Math.round(process.uptime()),
        sessions: sessionHistory.size,
        chat: HF_TOKEN ? 'huggingface' : 'none',
        tts: (elevenlabs && !elevenLabsDisabled) ? 'elevenlabs-ptbr' : 'edge-thalita-ptbr'
    });
});

// TTS pt-BR: ElevenLabs → Edge Neural (Thalita, grátis) → null (voz do navegador)
// Retorna { base64, mime } ou null
async function generateSpeech(text) {
    const engine = (elevenlabs && !elevenLabsDisabled) ? 'el' : 'edge';
    const cacheKey = `${engine}|${DEFAULT_VOICE_ID}|${EDGE_VOICE}|${text}`;
    const cached = ttsCacheGet(cacheKey);
    if (cached) {
        console.log('⚡ TTS cache hit');
        return cached;
    }

    if (elevenlabs && !elevenLabsDisabled) {
        try {
            const audio = await elevenlabs.textToSpeech.convert(
                DEFAULT_VOICE_ID,
                {
                    text: text,
                    modelId: 'eleven_turbo_v2_5',
                    languageCode: 'pt', // força português na síntese
                    outputFormat: 'mp3_44100_128'
                }
            );
            const chunks = [];
            for await (const chunk of audio) {
                chunks.push(chunk);
            }
            const audioBuffer = Buffer.concat(chunks);
            console.log('✅ Áudio ElevenLabs pt-BR:', audioBuffer.byteLength, 'bytes');
            const out = { base64: audioBuffer.toString('base64'), mime: 'audio/mpeg' };
            ttsCacheSet(cacheKey, out);
            return out;
        } catch (error) {
            const detail = error?.body ? JSON.stringify(error.body) : error.message;
            console.error('❌ ElevenLabs Error:', detail);
            if (detail.includes('quota_exceeded')) elevenLabsDisabled = true;
            // cai para o Edge TTS
        }
    }

    try {
        const out = await edgeSpeech(text);
        if (out) ttsCacheSet(cacheKey, out);
        return out;
    } catch (error) {
        console.error('❌ Edge TTS Error:', error.message);
        return null; // cliente cai para a voz pt-BR do navegador
    }
}

// Microsoft Edge TTS: voz neural feminina pt-BR, sem chave
function edgeSpeech(text) {
    return new Promise(async (resolve, reject) => {
        try {
            const tts = new MsEdgeTTS();
            await tts.setMetadata(EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
            const { audioStream } = tts.toStream(text);
            const chunks = [];
            const timer = setTimeout(() => reject(new Error('Edge TTS timeout')), 15000);
            audioStream.on('data', c => chunks.push(c));
            audioStream.on('end', () => {
                clearTimeout(timer);
                const buf = Buffer.concat(chunks);
                if (!buf.length) return reject(new Error('Edge TTS vazio'));
                console.log('✅ Áudio Edge/Thalita pt-BR:', buf.length, 'bytes');
                resolve({ base64: buf.toString('base64'), mime: 'audio/mpeg' });
            });
            audioStream.on('error', err => { clearTimeout(timer); reject(err); });
        } catch (e) {
            reject(e);
        }
    });
}

const MAX_MESSAGE_LEN = 2000;

// Login
app.post('/api/login', loginLimiter, (req, res) => {
    const { user, password } = req.body || {};
    const userOk = typeof user === 'string' && user.trim().toLowerCase() === AUTH_USER.toLowerCase();
    const passOk = typeof password === 'string' && password === AUTH_PASS;
    if (!userOk || !passOk) {
        return res.status(401).json({ error: 'Usuário ou senha incorretos' });
    }
    res.json({ token: signToken(AUTH_USER), user: AUTH_USER });
});

// Chat somente texto (o cliente pipelina o TTS por sentença)
app.post('/api/chat-text', apiLimiter, requireAuth, async (req, res) => {
    const start = Date.now();
    try {
        const { message, sessionId = 'default', model } = req.body;

        if (!message?.trim()) {
            return res.status(400).json({ error: 'Mensagem vazia' });
        }
        if (message.length > MAX_MESSAGE_LEN) {
            return res.status(400).json({ error: 'Mensagem muito longa' });
        }
        if (!HF_TOKEN) {
            return res.status(500).json({ error: 'HF_TOKEN não configurado' });
        }

        const response = await chat(message, sessionId, model);
        const elapsed = Date.now() - start;
        console.log(`💬 [${elapsed}ms] texto "${message.substring(0, 30)}..."`);

        res.json({ response, time: elapsed });
    } catch (error) {
        console.error('Erro:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Chat com streaming por frases (SSE). O cliente sintetiza o TTS de cada
// frase assim que ela chega, reduzindo muito o tempo até o primeiro áudio.
app.post('/api/chat-stream', apiLimiter, requireAuth, async (req, res) => {
    const start = Date.now();
    const { message, sessionId = 'default', model } = req.body;

    if (!message?.trim()) return res.status(400).json({ error: 'Mensagem vazia' });
    if (message.length > MAX_MESSAGE_LEN) return res.status(400).json({ error: 'Mensagem muito longa' });
    if (!HF_TOKEN) return res.status(500).json({ error: 'HF_TOKEN não configurado' });

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    try {
        const full = await chatStream(message, sessionId, model, (sentence) => {
            send({ type: 'sentence', text: sentence });
        });
        send({ type: 'done', full, time: Date.now() - start });
    } catch (error) {
        console.error('Erro stream:', error.message);
        send({ type: 'error', error: error.message });
    } finally {
        res.end();
    }
});

// TTS de um trecho (uma sentença do pipeline)
app.post('/api/tts', apiLimiter, requireAuth, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text?.trim()) {
            return res.status(400).json({ error: 'Texto vazio' });
        }
        const spoken = normalizeForSpeech(text.slice(0, 600));
        const speech = await generateSpeech(spoken);
        res.json({
            audioBase64: speech?.base64 || null,
            audioMime: speech?.mime || null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Continuidade: ajusta a última fala da ARIA no histórico para refletir
// apenas o que o usuário realmente ouviu antes de interromper.
app.post('/api/amend', requireAuth, (req, res) => {
    const { sessionId, spokenText } = req.body || {};
    const history = getHistory(sessionId);
    if (history.length) {
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'assistant') {
                const spoken = (spokenText || '').trim();
                history[i].content = spoken
                    ? `${spoken} (interrompida aqui pelo usuário)`
                    : '(interrompida antes de concluir)';
                break;
            }
        }
        setHistory(sessionId, history);
    }
    res.json({ success: true });
});

// Modelos
app.get('/api/models', (req, res) => {
    res.json({
        models: Object.entries(MODELS).map(([id, info]) => ({ id, ...info })),
        current: defaultSettings.model
    });
});

// Limpar conversa
app.post('/api/clear', requireAuth, (req, res) => {
    const { sessionId } = req.body;
    if (sessionId) {
        sessionHistory.delete(sessionId);
    }
    res.json({ success: true });
});

// Landing comercial na raiz; app de voz em /app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// ============================================
// INICIAR SERVIDOR (apenas local)
// ============================================
if (!IS_VERCEL) {
    const server = app.listen(PORT, () => {
        console.log(`
🎤 ARIA Voice v6.0

   URL: http://localhost:${PORT}
   Chat: ${HF_TOKEN ? 'huggingface' : '✗ defina HF_TOKEN'}
   TTS: ${elevenlabs ? 'elevenlabs (pt-BR)' : 'navegador (pt-BR)'}
`);
    });

    // Encerramento gracioso: termina requisições em curso antes de sair
    const shutdown = (signal) => {
        console.log(`\n${signal} recebido, encerrando servidor...`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

// Exportar para Vercel
module.exports = app;

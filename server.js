require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// MELHORIA 8: Compressão de respostas
app.use(compression());

// Middleware otimizado
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Cache headers otimizados para áudio
app.use('/audio', express.static(path.join(__dirname, 'public', 'audio'), {
    maxAge: '10m',
    etag: true,
    lastModified: true
}));

app.use(express.static('public', { 
    maxAge: '1h',
    etag: true
}));

// Inicializar Gemini AI - conexão persistente
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Cache de modelo pré-inicializado para respostas mais rápidas
let cachedModel = null;

// Histórico de conversas por sessão
const conversationHistory = new Map();

// Pool de chats ativos para reutilização
const chatPool = new Map();

// Configuração do modelo Gemini 2.0 Flash - OTIMIZADO PARA VELOCIDADE
const modelConfig = {
    model: "gemini-2.0-flash-exp",
    generationConfig: {
        temperature: 0.7,        // Reduzido para respostas mais rápidas
        topK: 20,                // Reduzido para velocidade
        topP: 0.8,               // Otimizado
        maxOutputTokens: 1024,   // Respostas mais curtas = mais rápido
    },
    systemInstruction: `Você é ARIA, assistente de voz.
REGRAS: Respostas CURTAS e DIRETAS. Máximo 2-3 frases.
Sem markdown, sem listas, sem formatação.
Texto natural para falar em voz alta.
Português brasileiro, tom amigável.`
};

// Pré-inicializar modelo na inicialização do servidor
function initModel() {
    cachedModel = genAI.getGenerativeModel(modelConfig);
    console.log('✅ Modelo Gemini pré-carregado');
}
initModel();

// Função para limpar markdown e caracteres especiais
function cleanMarkdown(text) {
    return text
        // Remove blocos de código
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        // Remove headers
        .replace(/#{1,6}\s*/g, '')
        // Remove bold e italic
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/___(.+?)___/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        // Remove listas
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        // Remove links
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove imagens
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
        // Remove blockquotes
        .replace(/^\s*>\s*/gm, '')
        // Remove linhas horizontais
        .replace(/^[-*_]{3,}\s*$/gm, '')
        // Remove pipes de tabelas
        .replace(/\|/g, ',')
        // Remove múltiplos espaços e quebras de linha
        .replace(/\n{3,}/g, '\n\n')
        .replace(/  +/g, ' ')
        // Limpa caracteres especiais restantes
        .replace(/[*_~`#]/g, '')
        .trim();
}

// Endpoint para chat com Gemini - OTIMIZADO
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { message, sessionId = 'default' } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'sua_chave_api_aqui') {
            return res.status(500).json({ 
                error: 'API Key do Gemini não configurada' 
            });
        }

        // Reutilizar chat existente ou criar novo
        let chat = chatPool.get(sessionId);
        
        if (!chat) {
            const history = conversationHistory.get(sessionId) || [];
            chat = cachedModel.startChat({
                history: history,
                generationConfig: modelConfig.generationConfig,
            });
            chatPool.set(sessionId, chat);
        }

        // Enviar mensagem - resposta direta sem await extra
        const result = await chat.sendMessage(message);
        const rawText = result.response.text();
        
        // Limpar markdown da resposta
        const text = cleanMarkdown(rawText);

        // Atualizar histórico em background
        setImmediate(() => {
            let history = conversationHistory.get(sessionId) || [];
            history.push(
                { role: 'user', parts: [{ text: message }] },
                { role: 'model', parts: [{ text: text }] }
            );
            if (history.length > 10) history.splice(0, 2);
            conversationHistory.set(sessionId, history);
        });

        const elapsed = Date.now() - startTime;
        console.log(`⚡ Resposta em ${elapsed}ms`);

        res.json({ 
            response: text,
            sessionId: sessionId,
            processingTime: elapsed
        });

    } catch (error) {
        console.error('Erro:', error.message);
        
        // Limpar chat com erro para forçar reconexão
        chatPool.delete(req.body.sessionId || 'default');
        
        res.status(500).json({ 
            error: 'Erro ao processar', 
            details: error.message 
        });
    }
});

// Endpoint para limpar histórico
app.post('/api/clear', (req, res) => {
    const { sessionId } = req.body;
    if (sessionId && conversationHistory.has(sessionId)) {
        conversationHistory.delete(sessionId);
        chatPool.delete(sessionId);
    }
    res.json({ success: true, message: 'Histórico limpo' });
});

// Diretório para arquivos de áudio temporários
const audioDir = path.join(__dirname, 'public', 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}

// Limpar áudios antigos (mais de 5 minutos)
setInterval(() => {
    const now = Date.now();
    fs.readdir(audioDir, (err, files) => {
        if (err) return;
        files.forEach(file => {
            const filePath = path.join(audioDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtimeMs > 5 * 60 * 1000) {
                    fs.unlink(filePath, () => {});
                }
            });
        });
    });
}, 60000);

// Vozes neurais disponíveis (Microsoft Edge TTS - GRATUITO)
const NEURAL_VOICES = {
    // Português Brasil - Femininas
    'thalita': 'pt-BR-ThalitaNeural',
    'francisca': 'pt-BR-FranciscaNeural',
    'leila': 'pt-BR-LeilaNeural',
    'leticia': 'pt-BR-LeticiaNeural',
    'manuela': 'pt-BR-ManuelaNeural',
    'yara': 'pt-BR-YaraNeural',
    // Português Brasil - Masculinas  
    'antonio': 'pt-BR-AntonioNeural',
    'fabio': 'pt-BR-FabioNeural',
    'humberto': 'pt-BR-HumbertoNeural',
    'julio': 'pt-BR-JulioNeural',
    'valerio': 'pt-BR-ValerioNeural',
    'donato': 'pt-BR-DonatoNeural',
    'nicolau': 'pt-BR-NicolauNeural',
    // Português Portugal
    'fernanda-pt': 'pt-PT-FernandaNeural',
    'duarte-pt': 'pt-PT-DuarteNeural',
    'raquel-pt': 'pt-PT-RaquelNeural'
};

// Endpoint para Text-to-Speech - OTIMIZADO
app.post('/api/tts', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { text, voice = 'francisca', rate = '+10%' } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Texto é obrigatório' });
        }

        const voiceName = NEURAL_VOICES[voice] || NEURAL_VOICES['francisca'];
        const hash = crypto.createHash('md5').update(text + voice).digest('hex').substring(0, 12);
        const filename = `${hash}.mp3`;
        const filepath = path.join(audioDir, filename);

        // Verificar cache
        if (fs.existsSync(filepath)) {
            console.log(`🎵 Cache hit: ${Date.now() - startTime}ms`);
            return res.json({ 
                audioUrl: `/audio/${filename}`,
                cached: true 
            });
        }

        // Texto limpo e curto
        const cleanText = text
            .replace(/"/g, "'")
            .replace(/\n/g, ' ')
            .replace(/[<>]/g, '')
            .substring(0, 500); // Limitar tamanho

        // Usar spawn ao invés de exec para melhor performance
        const args = [
            '--voice', voiceName,
            '--rate', rate,
            '--text', cleanText,
            '--write-media', filepath
        ];

        const tts = spawn('edge-tts', args, { timeout: 15000 });
        
        let stderr = '';
        tts.stderr.on('data', (data) => { stderr += data; });
        
        tts.on('close', (code) => {
            if (code !== 0 || !fs.existsSync(filepath)) {
                console.error('TTS erro:', stderr);
                return res.status(500).json({ error: 'Erro ao gerar áudio' });
            }
            
            console.log(`🎵 TTS gerado: ${Date.now() - startTime}ms`);
            res.json({ 
                audioUrl: `/audio/${filename}`,
                voice: voiceName,
                cached: false,
                processingTime: Date.now() - startTime
            });
        });

        tts.on('error', (err) => {
            console.error('TTS spawn erro:', err);
            res.status(500).json({ error: 'Erro no serviço de voz' });
        });

    } catch (error) {
        console.error('Erro TTS:', error);
        res.status(500).json({ error: 'Erro no serviço de voz' });
    }
});

// ENDPOINT COMBINADO: Chat + TTS em uma única chamada (MAIS RÁPIDO)
app.post('/api/voice', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { message, sessionId = 'default', voice = 'francisca' } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        // 1. Obter resposta do Gemini
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
        const text = cleanMarkdown(result.response.text());
        
        const aiTime = Date.now() - startTime;
        console.log(`⚡ AI: ${aiTime}ms`);

        // 2. Gerar áudio imediatamente
        const voiceName = NEURAL_VOICES[voice] || NEURAL_VOICES['francisca'];
        const hash = crypto.createHash('md5').update(text + voice).digest('hex').substring(0, 12);
        const filename = `${hash}.mp3`;
        const filepath = path.join(audioDir, filename);

        // Atualizar histórico em background
        setImmediate(() => {
            let history = conversationHistory.get(sessionId) || [];
            history.push(
                { role: 'user', parts: [{ text: message }] },
                { role: 'model', parts: [{ text: text }] }
            );
            if (history.length > 10) history.splice(0, 2);
            conversationHistory.set(sessionId, history);
        });

        // Cache hit
        if (fs.existsSync(filepath)) {
            console.log(`🎵 Total (cache): ${Date.now() - startTime}ms`);
            return res.json({ 
                response: text,
                audioUrl: `/audio/${filename}`,
                cached: true,
                processingTime: Date.now() - startTime
            });
        }

        // Gerar TTS
        const cleanText = text.replace(/"/g, "'").replace(/\n/g, ' ').substring(0, 500);
        const tts = spawn('edge-tts', [
            '--voice', voiceName,
            '--rate', '+10%',
            '--text', cleanText,
            '--write-media', filepath
        ]);

        tts.on('close', (code) => {
            const totalTime = Date.now() - startTime;
            console.log(`🎵 Total: ${totalTime}ms (AI: ${aiTime}ms, TTS: ${totalTime - aiTime}ms)`);
            
            res.json({ 
                response: text,
                audioUrl: code === 0 ? `/audio/${filename}` : null,
                processingTime: totalTime
            });
        });

        tts.on('error', () => {
            res.json({ response: text, audioUrl: null });
        });

    } catch (error) {
        console.error('Erro voice:', error.message);
        chatPool.delete(req.body.sessionId || 'default');
        res.status(500).json({ error: 'Erro ao processar' });
    }
});

// Listar vozes disponíveis
app.get('/api/voices', (req, res) => {
    const voices = Object.entries(NEURAL_VOICES).map(([id, name]) => ({
        id,
        name: name.replace('pt-BR-', '').replace('pt-PT-', '').replace('Neural', ''),
        fullName: name,
        language: name.includes('pt-BR') ? 'Português (Brasil)' : 'Português (Portugal)',
        gender: ['thalita', 'francisca', 'leila', 'leticia', 'manuela', 'yara', 'fernanda-pt', 'raquel-pt'].includes(id) ? 'Feminina' : 'Masculina'
    }));
    res.json({ voices });
});

// Endpoint de health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        model: modelConfig.model,
        apiConfigured: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'sua_chave_api_aqui'
    });
});

// Servir a página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🎤 IA Conversacional por Voz - Gemini 2.0                 ║
║                                                              ║
║   Servidor rodando em: http://localhost:${PORT}               ║
║   Modelo: ${modelConfig.model}                        ║
║                                                              ║
║   Certifique-se de configurar sua GEMINI_API_KEY no .env    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

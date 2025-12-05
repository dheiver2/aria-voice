require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function testOpenRouter() {
    console.log('1. Testando OpenRouter API...');
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        console.error('❌ OPENROUTER_API_KEY não encontrada no .env');
        return false;
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://aria-voice.app',
                'X-Title': 'ARIA Test'
            },
            body: JSON.stringify({
                model: 'openai/gpt-4o-mini',
                messages: [{ role: 'user', content: 'Olá, isso é um teste.' }]
            })
        });

        const data = await response.json();
        if (response.ok) {
            console.log('✅ OpenRouter respondeu:', data.choices[0].message.content);
            return true;
        } else {
            console.error('❌ Erro OpenRouter:', data);
            return false;
        }
    } catch (error) {
        console.error('❌ Erro de conexão:', error.message);
        return false;
    }
}

function testTTS() {
    console.log('\n2. Testando Edge-TTS...');
    return new Promise((resolve) => {
        const outputFile = path.join(__dirname, 'test-audio.mp3');
        const tts = spawn('edge-tts', [
            '--text', 'Teste de áudio bem sucedido.',
            '--write-media', outputFile
        ]);

        tts.on('close', (code) => {
            if (code === 0) {
                if (fs.existsSync(outputFile)) {
                    console.log('✅ Áudio gerado com sucesso:', outputFile);
                    fs.unlinkSync(outputFile); // Limpar
                    resolve(true);
                } else {
                    console.error('❌ Arquivo de áudio não foi criado.');
                    resolve(false);
                }
            } else {
                console.error('❌ Edge-TTS falhou com código:', code);
                resolve(false);
            }
        });

        tts.on('error', (err) => {
            console.error('❌ Erro ao iniciar Edge-TTS:', err.message);
            resolve(false);
        });
    });
}

async function run() {
    const apiOk = await testOpenRouter();
    const ttsOk = await testTTS();

    if (apiOk && ttsOk) {
        console.log('\n✅ SISTEMA OPERACIONAL: Backend está funcionando corretamente.');
    } else {
        console.log('\n❌ FALHA NO SISTEMA: Verifique os erros acima.');
    }
}

run();

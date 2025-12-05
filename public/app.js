/**
 * ARIA Voice - Frontend
 * Versão 5.0 - Sistema limpo e refatorado
 */

class ARIA {
    constructor() {
        this.state = {
            listening: false,
            processing: false,
            speaking: false,
            sessionId: `session_${Date.now()}`
        };
        
        this.settings = {
            voice: 'francisca',
            speed: 0,
            model: 'openai/gpt-4o-mini'
        };
        
        this.recognition = null;
        this.audio = new Audio();
        this.speechTimeout = null;
        this.transcript = '';
        
        this.init();
    }
    
    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    
    async init() {
        console.log('🚀 ARIA iniciando...');
        
        // Detectar dispositivo móvel (inclui iPad moderno que se identifica como Mac)
        const isIPadOS = navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform);
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || isIPadOS;
        this.isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || isIPadOS;
        this.isAndroid = /Android/i.test(navigator.userAgent);
        console.log('📱 Mobile:', this.isMobile, 'iOS:', this.isIOS, 'Android:', this.isAndroid);
        
        // Elementos DOM
        this.$ = {
            orb: document.getElementById('orb'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsPanel: document.getElementById('settingsPanel'),
            voiceSelect: document.getElementById('voiceSelect'),
            speedRange: document.getElementById('speedRange'),
            speedValue: document.getElementById('speedValue'),
            modelSelect: document.getElementById('modelSelect'),
            clearBtn: document.getElementById('clearBtn')
        };
        
        // Inicializar AudioContext para mobile
        this.initAudioContext();
        
        // Carregar configurações
        await this.loadSettings();
        
        // Configurar reconhecimento de voz
        this.setupSpeechRecognition();
        
        // Verificar suporte a recursos
        this.checkBrowserSupport();
        
        // Event listeners
        this.setupEventListeners();
        
        console.log('✅ ARIA pronta!');
    }
    
    checkBrowserSupport() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            console.warn('⚠️ Speech Recognition não suportado neste navegador');
            // Mostrar mensagem para o usuário
            this.showNotification('Seu navegador não suporta reconhecimento de voz. Use Chrome ou Safari.');
        }
        
        if (!('speechSynthesis' in window)) {
            console.warn('⚠️ Speech Synthesis não suportado');
        }
        
        console.log('🔍 Suporte: SpeechRecognition:', !!SpeechRecognition, 'SpeechSynthesis:', 'speechSynthesis' in window);
    }
    
    showNotification(message) {
        // Criar notificação temporária
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 100, 100, 0.9);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }
    
    initAudioContext() {
        // AudioContext precisa ser criado após interação do usuário no mobile
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            this.audioContext = new AudioContext();
            console.log('🔊 AudioContext criado, state:', this.audioContext.state);
        }
    }
    
    async unlockAudio() {
        // Desbloquear áudio no iOS/Android após toque
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
            console.log('🔓 AudioContext desbloqueado');
        }
        
        // Tocar um som silencioso para desbloquear
        const silentAudio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+9DEAAAIAANIAAAAgAAA0gAAABBHx0jgQCAIAgDCgIAgCHf5QOD4Pg+D4nB8HxOD4nB8Hw+JwfB8HwfB/yg+D4Ph8TlAQBAEO/ygIAgOhQiouE4IBgGAYBgGAQCg+D7/B9/5QEO/5QEO/6EAEAv//tQxAkAAADSAAAAAAAAANIAAAAASAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7UMQJgAAA0gAAAAAA0gAAAABIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
        silentAudio.volume = 0.01;
        try {
            await silentAudio.play();
            silentAudio.pause();
            console.log('🔓 Áudio desbloqueado');
        } catch (e) {
            console.log('⚠️ Não foi possível desbloquear áudio:', e.message);
        }
    }
    
    async loadSettings() {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            this.settings = { ...this.settings, ...data };
            this.applySettings();
        } catch (e) {
            console.warn('Usando configurações padrão');
        }
    }
    
    async saveSettings() {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.settings)
            });
        } catch (e) {
            console.warn('Erro ao salvar');
        }
    }
    
    applySettings() {
        if (this.$.voiceSelect) this.$.voiceSelect.value = this.settings.voice;
        if (this.$.speedRange) {
            this.$.speedRange.value = this.settings.speed;
            this.updateSpeedLabel();
        }
        if (this.$.modelSelect) this.$.modelSelect.value = this.settings.model;
    }
    
    updateSpeedLabel() {
        const val = parseInt(this.$.speedRange.value);
        this.$.speedValue.textContent = val === 0 ? 'Normal' : `${val > 0 ? '+' : ''}${val}%`;
    }
    
    // ============================================
    // RECONHECIMENTO DE VOZ
    // ============================================
    
    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            console.error('Reconhecimento de voz não suportado');
            return;
        }
        
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'pt-BR';
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        
        this.recognition.onstart = () => {
            this.state.listening = true;
            this.$.orb.classList.add('listening');
            this.transcript = '';
        };
        
        this.recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            this.transcript = result[0].transcript.trim();
            
            // Limpar timeout anterior
            if (this.speechTimeout) clearTimeout(this.speechTimeout);
            
            if (result.isFinal) {
                this.processTranscript();
            } else {
                // Processar após 0.8s de silêncio (mais rápido)
                this.speechTimeout = setTimeout(() => {
                    if (this.transcript && this.state.listening) {
                        this.processTranscript();
                    }
                }, 800);
            }
        };
        
        this.recognition.onend = () => {
            this.state.listening = false;
            this.$.orb.classList.remove('listening');
        };
        
        this.recognition.onerror = (event) => {
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                console.warn('Erro:', event.error);
            }
            this.state.listening = false;
            this.$.orb.classList.remove('listening');
        };
    }
    
    processTranscript() {
        if (!this.transcript || this.state.processing) return;
        
        const text = this.transcript;
        this.transcript = '';
        this.stopListening();
        this.sendMessage(text);
    }
    
    async startListening() {
        if (!this.recognition || this.state.listening || this.state.processing || this.state.speaking) return;
        
        // Desbloquear áudio no mobile (precisa ser no evento de toque)
        if (this.isMobile) {
            await this.unlockAudio();
        }
        
        try {
            this.recognition.start();
        } catch (e) {
            // Já está ouvindo
        }
    }
    
    stopListening() {
        if (this.speechTimeout) {
            clearTimeout(this.speechTimeout);
            this.speechTimeout = null;
        }
        
        if (this.recognition && this.state.listening) {
            try {
                this.recognition.stop();
            } catch (e) {}
        }
        this.state.listening = false;
    }
    
    // ============================================
    // COMUNICAÇÃO COM API
    // ============================================
    
    async sendMessage(message) {
        this.state.processing = true;
        this.$.orb.classList.add('thinking');
        
        console.log('📤 Enviando:', message);
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
            
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    sessionId: this.state.sessionId
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!res.ok) {
                const errorText = await res.text();
                console.error('❌ API Error:', res.status, errorText);
                throw new Error(`API Error: ${res.status}`);
            }
            
            const data = await res.json();
            console.log('📥 Resposta:', data.response?.substring(0, 50), 'Audio:', data.audioBase64?.length || 0);
            
            // Salvar resposta para fallback
            this.lastResponse = data.response;
            
            this.$.orb.classList.remove('thinking');
            
            // Prioridade: ElevenLabs TTS (base64) > Browser TTS
            if (data.audioBase64 && data.audioBase64.length > 0) {
                console.log('🎵 Tocando áudio ElevenLabs');
                await this.playBase64Audio(data.audioBase64);
            } else {
                console.log('🗣️ Usando TTS do navegador');
                await this.speakWithBrowser(data.response);
            }
            
        } catch (error) {
            console.error('❌ Erro:', error.message);
            this.$.orb.classList.remove('thinking');
            this.state.processing = false;
            
            // Tentar falar erro no mobile
            if (this.isMobile && error.name === 'AbortError') {
                this.speakWithBrowser('Desculpe, a conexão demorou muito. Tente novamente.');
            }
        }
    }
    
    // ============================================
    // ÁUDIO ELEVENLABS TTS (voz ultra-natural)
    // ============================================
    
    async playBase64Audio(base64) {
        return new Promise(async (resolve) => {
            console.log('🎵 Preparando áudio, tamanho base64:', base64.length);
            
            this.state.speaking = true;
            this.state.processing = false;
            this.$.orb.classList.add('speaking');
            
            // No iOS, usar TTS do navegador diretamente (mais confiável)
            if (this.isIOS) {
                console.log('📱 iOS detectado, usando TTS do navegador');
                await this.speakWithBrowser(this.lastResponse || '');
                resolve();
                return;
            }
            
            // Sempre criar novo Audio
            const audio = new Audio();
            
            // Converter base64 para blob
            try {
                const byteCharacters = atob(base64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(blob);
                audio.src = audioUrl;
            } catch (e) {
                console.error('❌ Erro base64:', e);
                audio.src = `data:audio/mpeg;base64,${base64}`;
            }
            
            audio.volume = 1.0;
            audio.preload = 'auto';
            
            const cleanup = () => {
                this.state.speaking = false;
                this.$.orb.classList.remove('speaking');
                if (audio.src.startsWith('blob:')) {
                    URL.revokeObjectURL(audio.src);
                }
            };
            
            audio.onended = () => {
                console.log('🎵 Audio finalizado');
                cleanup();
                resolve();
            };
            
            audio.onerror = async (e) => {
                console.error('❌ Erro áudio:', e);
                cleanup();
                await this.speakWithBrowser(this.lastResponse || '');
                resolve();
            };
            
            try {
                await audio.play();
                console.log('▶️ Audio tocando');
            } catch (e) {
                console.error('❌ Erro play:', e.message);
                cleanup();
                await this.speakWithBrowser(this.lastResponse || '');
                resolve();
            }
        });
    }
    
    // ============================================
    // TTS DO NAVEGADOR - FALLBACK
    // ============================================
    
    getBestFemaleVoice() {
        const voices = speechSynthesis.getVoices();
        
        // Prioridade de vozes femininas naturais em português
        const preferredVoices = [
            // Google (mais natural)
            'Google português do Brasil',
            'Google Português Brasil',
            // Microsoft Azure Neural (muito natural)
            'Microsoft Francisca Online (Natural)',
            'Microsoft Thalita Online (Natural)',
            'Francisca',
            'Thalita',
            // Microsoft padrão
            'Microsoft Maria',
            'Maria',
            // Apple
            'Luciana',
            // Outras
            'Fernanda',
            'Vitória',
            'Raquel'
        ];
        
        // Buscar por nome preferido
        for (const name of preferredVoices) {
            const voice = voices.find(v => 
                v.name.includes(name) && 
                v.lang.startsWith('pt')
            );
            if (voice) {
                console.log('🎤 Voz selecionada:', voice.name);
                return voice;
            }
        }
        
        // Fallback: qualquer voz feminina em português
        const ptFemale = voices.find(v => 
            v.lang.startsWith('pt') && 
            (v.name.toLowerCase().includes('female') || 
             v.name.match(/maria|ana|lucia|fernanda|vitoria|raquel|francisca|thalita/i))
        );
        if (ptFemale) {
            console.log('🎤 Voz fallback:', ptFemale.name);
            return ptFemale;
        }
        
        // Último fallback: qualquer voz em português
        const ptVoice = voices.find(v => v.lang.startsWith('pt'));
        if (ptVoice) {
            console.log('🎤 Voz PT:', ptVoice.name);
            return ptVoice;
        }
        
        return voices[0];
    }
    
    async speakWithBrowser(text) {
        return new Promise((resolve) => {
            if (!('speechSynthesis' in window)) {
                console.warn('SpeechSynthesis não suportado');
                this.state.processing = false;
                return resolve();
            }
            
            // Cancelar fala anterior
            speechSynthesis.cancel();
            
            // iOS tem bug que para TTS após ~15 segundos
            // Dividir texto em chunks menores
            const chunks = this.splitTextIntoChunks(text, this.isIOS ? 150 : 500);
            console.log('🗣️ TTS: dividido em', chunks.length, 'partes');
            
            // Aguardar vozes carregarem
            const speak = async () => {
                this.state.speaking = true;
                this.state.processing = false;
                this.$.orb.classList.add('speaking');
                
                const voice = this.getBestFemaleVoice();
                
                for (let i = 0; i < chunks.length; i++) {
                    if (!this.state.speaking) break; // Interrompido
                    
                    await this.speakChunk(chunks[i], voice);
                }
                
                this.state.speaking = false;
                this.$.orb.classList.remove('speaking');
                resolve();
            };
            
            // Vozes podem demorar para carregar
            if (speechSynthesis.getVoices().length === 0) {
                speechSynthesis.onvoiceschanged = speak;
                // Timeout caso vozes nunca carreguem
                setTimeout(() => {
                    if (speechSynthesis.getVoices().length === 0) {
                        speak(); // Tentar mesmo assim
                    }
                }, 1000);
            } else {
                speak();
            }
        });
    }
    
    splitTextIntoChunks(text, maxLength) {
        const chunks = [];
        const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
        
        let currentChunk = '';
        for (const sentence of sentences) {
            if ((currentChunk + sentence).length <= maxLength) {
                currentChunk += sentence;
            } else {
                if (currentChunk) chunks.push(currentChunk.trim());
                currentChunk = sentence;
            }
        }
        if (currentChunk) chunks.push(currentChunk.trim());
        
        return chunks.length > 0 ? chunks : [text];
    }
    
    speakChunk(text, voice) {
        return new Promise((resolve) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'pt-BR';
            utterance.rate = 0.95 + (this.settings.speed / 200);
            utterance.pitch = 1.05;
            utterance.volume = 1;
            if (voice) utterance.voice = voice;
            
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();
            
            // iOS workaround: resume pode ser necessário
            if (this.isIOS) {
                speechSynthesis.resume();
            }
            
            speechSynthesis.speak(utterance);
            
            // Timeout de segurança (15s por chunk)
            setTimeout(() => resolve(), 15000);
        });
    }
    
    // ============================================
    // ÁUDIO (Edge-TTS local)
    // ============================================
    
    async playAudio(url) {
        return new Promise((resolve) => {
            this.state.speaking = true;
            this.state.processing = false;
            this.$.orb.classList.add('speaking');
            
            this.audio.src = url + '?t=' + Date.now();
            
            this.audio.onended = () => {
                this.state.speaking = false;
                this.$.orb.classList.remove('speaking');
                resolve();
            };
            
            this.audio.onerror = () => {
                this.state.speaking = false;
                this.$.orb.classList.remove('speaking');
                resolve();
            };
            
            this.audio.play().catch(() => {
                this.state.speaking = false;
                this.$.orb.classList.remove('speaking');
                resolve();
            });
        });
    }
    
    stopAudio() {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.state.speaking = false;
        this.$.orb.classList.remove('speaking');
    }
    
    // ============================================
    // UI
    // ============================================
    
    setupEventListeners() {
        // Clique no orb
        this.$.orb.addEventListener('click', () => {
            if (this.state.speaking) {
                this.stopAudio();
            } else if (this.state.listening) {
                this.stopListening();
            } else if (!this.state.processing) {
                this.startListening();
            }
        });
        
        // Configurações
        this.$.settingsBtn?.addEventListener('click', () => {
            this.$.settingsPanel.classList.toggle('open');
        });
        
        // Fechar configurações ao clicar fora
        document.addEventListener('click', (e) => {
            if (this.$.settingsPanel?.classList.contains('open') &&
                !this.$.settingsPanel.contains(e.target) &&
                e.target !== this.$.settingsBtn) {
                this.$.settingsPanel.classList.remove('open');
            }
        });
        
        // Voz
        this.$.voiceSelect?.addEventListener('change', (e) => {
            this.settings.voice = e.target.value;
            this.saveSettings();
        });
        
        // Velocidade
        this.$.speedRange?.addEventListener('input', () => {
            this.settings.speed = parseInt(this.$.speedRange.value);
            this.updateSpeedLabel();
            this.saveSettings();
        });
        
        // Modelo
        this.$.modelSelect?.addEventListener('change', (e) => {
            this.settings.model = e.target.value;
            this.saveSettings();
        });
        
        // Limpar conversa
        this.$.clearBtn?.addEventListener('click', async () => {
            await fetch('/api/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.state.sessionId })
            });
            this.state.sessionId = `session_${Date.now()}`;
            this.$.settingsPanel.classList.remove('open');
        });
        
        // Teclado
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.target.matches('input, textarea, select')) {
                e.preventDefault();
                if (this.state.speaking) {
                    this.stopAudio();
                } else if (!this.state.listening && !this.state.processing) {
                    this.startListening();
                }
            }
        });
    }
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    window.aria = new ARIA();
});

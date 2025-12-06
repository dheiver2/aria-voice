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
            sessionId: `session_${Date.now()}`,
            continuousMode: false // Modo conversação contínua
        };
        
        this.settings = {
            voice: 'francisca',
            speed: 0,
            model: 'openai/gpt-4o-mini',
            autoListen: true // Reiniciar escuta após resposta
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
            this.showNotification('Seu navegador não suporta reconhecimento de voz. Use o campo de texto abaixo.');
            // Mostrar input de texto como fallback
            this.showTextInputFallback();
        }
        
        if (!('speechSynthesis' in window)) {
            console.warn('⚠️ Speech Synthesis não suportado');
        }
        
        console.log('🔍 Suporte: SpeechRecognition:', !!SpeechRecognition, 'SpeechSynthesis:', 'speechSynthesis' in window);
    }
    
    // Fallback de input de texto para navegadores sem reconhecimento de voz (Firefox)
    showTextInputFallback() {
        const container = document.querySelector('.orb-container');
        if (!container || document.getElementById('textInputFallback')) return;
        
        const inputWrapper = document.createElement('div');
        inputWrapper.id = 'textInputFallback';
        inputWrapper.className = 'text-input-fallback';
        inputWrapper.innerHTML = `
            <input type="text" id="textInput" placeholder="Digite sua mensagem..." autocomplete="off" />
            <button id="sendTextBtn" aria-label="Enviar mensagem">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
            </button>
        `;
        
        container.appendChild(inputWrapper);
        
        const input = document.getElementById('textInput');
        const btn = document.getElementById('sendTextBtn');
        
        const sendMessage = () => {
            const text = input.value.trim();
            if (text && !this.state.processing && !this.state.speaking) {
                this.sendMessage(text);
                input.value = '';
            }
        };
        
        btn.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
    
    showNotification(message, type = 'error') {
        // Cores por tipo
        const colors = {
            error: 'rgba(255, 100, 100, 0.9)',
            info: 'rgba(0, 200, 255, 0.9)',
            success: 'rgba(0, 255, 136, 0.9)'
        };
        
        // Remover notificação anterior se existir
        const existing = document.getElementById('ariaNotification');
        if (existing) existing.remove();
        
        // Criar notificação temporária
        const notification = document.createElement('div');
        notification.id = 'ariaNotification';
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 24px;
            border-radius: 12px;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: slideUp 0.3s ease;
        `;
        notification.textContent = message;
        
        // Adicionar keyframe se não existir
        if (!document.getElementById('notificationKeyframes')) {
            const style = document.createElement('style');
            style.id = 'notificationKeyframes';
            style.textContent = `
                @keyframes slideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(-50%) translateY(20px)';
            notification.style.transition = 'all 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
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
        try {
            // 1. Resumir AudioContext
            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                console.log('🔓 AudioContext desbloqueado');
            }
            
            // 2. Criar e tocar um buffer silencioso via Web Audio API (mais confiável no iOS)
            if (this.audioContext) {
                const buffer = this.audioContext.createBuffer(1, 1, 22050);
                const source = this.audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(this.audioContext.destination);
                source.start(0);
            }
            
            // 3. Tocar um som silencioso via Audio element
            const silentAudio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+9DEAAAIAANIAAAAgAAA0gAAABBHx0jgQCAIAgDCgIAgCHf5QOD4Pg+D4nB8HxOD4nB8Hw+JwfB8HwfB/yg+D4Ph8TlAQBAEO/ygIAgOhQiouE4IBgGAYBgGAQCg+D7/B9/5QEO/5QEO/6EAEAv//tQxAkAAADSAAAAAAAAANIAAAAASAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7UMQJgAAA0gAAAAAA0gAAAABIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
            silentAudio.volume = 0.01;
            silentAudio.setAttribute('playsinline', 'true');
            await silentAudio.play();
            silentAudio.pause();
            
            // 4. Carregar vozes de TTS (iOS precisa disso cedo)
            if ('speechSynthesis' in window) {
                speechSynthesis.getVoices();
            }
            
            this.audioUnlocked = true;
            console.log('🔓 Áudio completamente desbloqueado');
        } catch (e) {
            console.log('⚠️ Erro ao desbloquear áudio:', e.message);
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
            
            // Iniciar visualização de áudio em tempo real
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                        this.micStream = stream;
                        if (window.startAudioVisualization) {
                            window.startAudioVisualization(stream);
                        }
                    })
                    .catch(err => console.log('Visualização não disponível:', err));
            }
        };
        
        this.recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            this.transcript = result[0].transcript.trim();
            
            // Mostrar texto em tempo real
            this.showTranscript(this.transcript, !result.isFinal);
            
            // Limpar timeout anterior
            if (this.speechTimeout) clearTimeout(this.speechTimeout);
            
            if (result.isFinal) {
                this.processTranscript();
            } else {
                // Processar após silêncio (mais tempo no mobile para conexões lentas)
                const timeout = this.isMobile ? 1200 : 800;
                this.speechTimeout = setTimeout(() => {
                    if (this.transcript && this.state.listening) {
                        this.processTranscript();
                    }
                }, timeout);
            }
        };
        
        this.recognition.onend = () => {
            this.state.listening = false;
            this.$.orb.classList.remove('listening');
            
            // Parar visualização de áudio
            if (window.stopAudioVisualization) {
                window.stopAudioVisualization();
            }
            
            // Parar stream do microfone
            if (this.micStream) {
                this.micStream.getTracks().forEach(track => track.stop());
                this.micStream = null;
            }
        };
        
        this.recognition.onerror = (event) => {
            console.warn('🎙️ Erro reconhecimento:', event.error);
            
            // Tratar erros específicos
            switch (event.error) {
                case 'not-allowed':
                    this.showNotification('Permita o acesso ao microfone nas configurações do navegador', 'error');
                    this.showTextInputFallback();
                    break;
                case 'network':
                    this.showNotification('Erro de conexão. Verifique sua internet.', 'error');
                    break;
                case 'audio-capture':
                    this.showNotification('Microfone não encontrado ou em uso', 'error');
                    this.showTextInputFallback();
                    break;
                case 'no-speech':
                case 'aborted':
                    // Silencioso - normal
                    break;
                default:
                    if (this.isMobile) {
                        this.showNotification('Toque novamente para falar', 'info');
                    }
            }
            
            this.state.listening = false;
            this.$.orb.classList.remove('listening');
        };
    }
    
    processTranscript() {
        if (!this.transcript || this.state.processing) return;
        
        const text = this.transcript;
        this.transcript = '';
        this.hideTranscript();
        this.stopListening();
        this.sendMessage(text);
    }
    
    // Mostrar texto transcrito em tempo real
    showTranscript(text, isInterim = false) {
        let el = document.getElementById('liveTranscript');
        if (!el) {
            el = document.createElement('div');
            el.id = 'liveTranscript';
            el.style.cssText = `
                position: fixed;
                bottom: 120px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: ${isInterim ? 'rgba(255,255,255,0.6)' : '#00f5ff'};
                padding: 12px 24px;
                border-radius: 20px;
                font-size: 16px;
                max-width: 80%;
                text-align: center;
                z-index: 1000;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(0, 245, 255, 0.3);
                transition: opacity 0.2s;
            `;
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.style.color = isInterim ? 'rgba(255,255,255,0.6)' : '#00f5ff';
        el.style.opacity = '1';
    }
    
    hideTranscript() {
        const el = document.getElementById('liveTranscript');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 200);
        }
    }
    
    // Mostrar resposta da ARIA brevemente
    showResponse(text) {
        let el = document.getElementById('ariaResponse');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ariaResponse';
            el.style.cssText = `
                position: fixed;
                top: 100px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, rgba(0, 245, 255, 0.1), rgba(255, 0, 255, 0.1));
                color: #fff;
                padding: 16px 28px;
                border-radius: 16px;
                font-size: 15px;
                max-width: 85%;
                text-align: center;
                z-index: 1000;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(0, 245, 255, 0.2);
                line-height: 1.5;
                opacity: 0;
                transition: opacity 0.3s;
            `;
            document.body.appendChild(el);
        }
        
        // Limitar texto para exibição
        const displayText = text.length > 200 ? text.substring(0, 200) + '...' : text;
        el.textContent = displayText;
        el.style.opacity = '1';
        
        // Esconder após 5 segundos
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        }, 5000);
    }
    
    // Mostrar indicador de pronto para ouvir
    showReadyIndicator() {
        let el = document.getElementById('readyIndicator');
        if (!el) {
            el = document.createElement('div');
            el.id = 'readyIndicator';
            el.style.cssText = `
                position: fixed;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 255, 136, 0.2);
                color: #00ff88;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 13px;
                z-index: 1000;
                border: 1px solid rgba(0, 255, 136, 0.3);
                animation: pulse-ready 1.5s ease-in-out infinite;
            `;
            document.body.appendChild(el);
            
            // Adicionar keyframe se não existir
            if (!document.getElementById('readyKeyframes')) {
                const style = document.createElement('style');
                style.id = 'readyKeyframes';
                style.textContent = `
                    @keyframes pulse-ready {
                        0%, 100% { opacity: 0.7; transform: translateX(-50%) scale(1); }
                        50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
                    }
                `;
                document.head.appendChild(style);
            }
        }
        el.textContent = '🎤 Pode falar...';
        
        // Esconder após 3 segundos
        setTimeout(() => {
            if (el && el.parentNode) {
                el.remove();
            }
        }, 3000);
    }
    
    async startListening() {
        if (!this.recognition || this.state.listening || this.state.processing || this.state.speaking) return;
        
        // Desbloquear áudio no mobile (precisa ser no evento de toque)
        if (this.isMobile) {
            await this.unlockAudio();
        }
        
        // Verificar permissão de microfone primeiro (se API disponível)
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const result = await navigator.permissions.query({ name: 'microphone' });
                if (result.state === 'denied') {
                    this.showNotification('Microfone bloqueado. Permita nas configurações.', 'error');
                    this.showTextInputFallback();
                    return;
                }
            } catch (e) {
                // API não suportada, continuar normalmente
            }
        }
        
        try {
            this.recognition.start();
            console.log('🎙️ Reconhecimento iniciado');
        } catch (e) {
            if (e.name === 'InvalidStateError') {
                // Já está ouvindo, ignorar
            } else {
                console.error('❌ Erro ao iniciar reconhecimento:', e);
                this.showNotification('Erro ao acessar microfone', 'error');
            }
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
            
            // Adicionar ao histórico de conversas (UX)
            if (window.addChatMessage) {
                window.addChatMessage(message, 'user');
                window.addChatMessage(data.response, 'assistant');
            }
            
            // Mostrar resposta brevemente
            this.showResponse(data.response);
            
            this.$.orb.classList.remove('thinking');
            
            // Prioridade: ElevenLabs TTS (base64) > Browser TTS
            if (data.audioBase64 && data.audioBase64.length > 0) {
                console.log('🎵 Tocando áudio ElevenLabs');
                await this.playBase64Audio(data.audioBase64);
            } else {
                console.log('🗣️ Usando TTS do navegador');
                await this.speakWithBrowser(data.response);
            }
            
            // Reiniciar escuta automaticamente se autoListen ativo
            if (this.settings.autoListen && !this.state.speaking) {
                setTimeout(() => {
                    if (!this.state.speaking && !this.state.processing) {
                        this.showReadyIndicator();
                        // Iniciar escuta automaticamente após delay
                        setTimeout(() => this.startListening(), 500);
                    }
                }, 300);
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
            
            // No iOS, usar TTS nativo se áudio não foi desbloqueado
            if (this.isIOS && !this.audioUnlocked) {
                console.log('📱 iOS sem áudio desbloqueado, usando TTS');
                await this.speakWithBrowser(this.lastResponse || '');
                resolve();
                return;
            }
            
            // Sempre criar novo Audio
            const audio = new Audio();
            audio.setAttribute('playsinline', 'true'); // Importante para iOS
            audio.setAttribute('webkit-playsinline', 'true');
            
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
            
            let resolved = false;
            const finish = () => {
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            };
            
            utterance.onend = finish;
            utterance.onerror = (e) => {
                console.warn('🗣️ TTS erro:', e.error);
                finish();
            };
            
            // iOS workarounds
            if (this.isIOS) {
                // Resume pode ser necessário
                speechSynthesis.resume();
                
                // iOS para TTS quando tela bloqueia - manter ativo
                const keepAlive = setInterval(() => {
                    if (speechSynthesis.speaking) {
                        speechSynthesis.resume();
                    } else {
                        clearInterval(keepAlive);
                    }
                }, 5000);
                
                // Limpar interval quando terminar
                utterance.onend = () => {
                    clearInterval(keepAlive);
                    finish();
                };
            }
            
            speechSynthesis.speak(utterance);
            
            // Timeout de segurança (20s por chunk no mobile, 15s desktop)
            const timeout = this.isMobile ? 20000 : 15000;
            setTimeout(finish, timeout);
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
        
        // Parar TTS do navegador também
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        
        this.state.speaking = false;
        this.$.orb.classList.remove('speaking');
    }
    
    // ============================================
    // UI
    // ============================================
    
    setupEventListeners() {
        // Clique no orb
        this.$.orb.addEventListener('click', () => {
            // Haptic feedback para mobile
            if (this.isMobile && navigator.vibrate) {
                navigator.vibrate(50);
            }
            
            if (this.state.speaking) {
                this.stopAudio();
            } else if (this.state.listening) {
                this.stopListening();
            } else if (!this.state.processing) {
                this.startListening();
            }
        });
        
        // Configurações
        this.$.settingsBtn?.addEventListener('click', (e) => {
            e.stopPropagation(); // Evitar que o clique feche o painel imediatamente
            this.$.settingsPanel.classList.toggle('open');
        });
        
        // Fechar configurações ao clicar fora
        document.addEventListener('click', (e) => {
            if (this.$.settingsPanel?.classList.contains('open') &&
                !this.$.settingsPanel.contains(e.target) &&
                !this.$.settingsBtn?.contains(e.target)) {
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
        
        // Toggle escuta automática
        const autoListenToggle = document.getElementById('autoListenToggle');
        if (autoListenToggle) {
            autoListenToggle.checked = this.settings.autoListen;
            autoListenToggle.addEventListener('change', (e) => {
                this.settings.autoListen = e.target.checked;
                this.saveSettings();
                
                // Feedback visual
                const status = e.target.checked ? 'Escuta contínua ativada' : 'Escuta contínua desativada';
                this.showNotification(status, 'info');
            });
        }
        
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

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
            speed: 0,
            model: null, // definido pelo catálogo /api/models
            autoListen: true, // Reiniciar escuta após resposta
            bargeIn: true // Interromper a ARIA falando por cima
        };
        this.bargeInActive = false;
        this.models = [];

        this.recognition = null;
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

        // iOS/Android: unlock audio on first tap/pointer event to avoid autoplay restrictions
        const unlockHandler = async () => {
            await this.unlockAudio();
            document.removeEventListener('touchstart', unlockHandler);
            document.removeEventListener('pointerdown', unlockHandler);
        };
        document.addEventListener('touchstart', unlockHandler, { once: true });
        document.addEventListener('pointerdown', unlockHandler, { once: true });

        // If on iOS and audio hasn't been unlocked, show a gentle hint to the user
        if (this.isIOS && !this.audioUnlocked) {
            setTimeout(() => this.showAudioUnlockHint(), 500);
        }
        
        console.log('✅ ARIA pronta!');
    }

    showAudioUnlockHint() {
        if (document.getElementById('audioUnlockHint')) return;
        const hint = document.createElement('div');
        hint.id = 'audioUnlockHint';
        hint.className = 'permissions-banner';
        hint.innerHTML = `
            <div class="banner-text">Toque em qualquer lugar da tela para ativar áudio e microfone.</div>
            <button id="audioUnlockDismiss" aria-label="Fechar">OK</button>
        `;
        document.body.appendChild(hint);
        document.getElementById('audioUnlockDismiss').addEventListener('click', () => hint.remove());
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
            <input type="text" id="textInput" placeholder="Digite sua mensagem..." autocomplete="on" autocapitalize="sentences" autocorrect="on" inputmode="text" />
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
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
        // Focar automaticamente em mobile para abrir teclado
        try { input.focus(); } catch (e) {}
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
        // Configurações persistem no navegador
        try {
            const saved = JSON.parse(localStorage.getItem('aria-settings'));
            if (saved) this.settings = { ...this.settings, ...saved };
        } catch (e) {}
        this.applySettings();
        await this.loadModels();
    }

    saveSettings() {
        try {
            localStorage.setItem('aria-settings', JSON.stringify(this.settings));
        } catch (e) {}
    }

    // Catálogo de modelos vem do servidor (fonte única da verdade)
    async loadModels() {
        try {
            const res = await fetch('/api/models');
            const data = await res.json();
            this.models = data.models || [];

            if (this.$.modelSelect) {
                const icons = { fast: '⚡', mid: '🧠', premium: '✨', free: '🆓' };
                this.$.modelSelect.innerHTML = '';
                this.models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = `${icons[m.tier] || ''} ${m.name}`.trim();
                    this.$.modelSelect.appendChild(opt);
                });
            }

            // Valida o modelo salvo contra o catálogo atual
            if (!this.models.some(m => m.id === this.settings.model)) {
                this.settings.model = data.current;
                this.saveSettings();
            }
            if (this.$.modelSelect) this.$.modelSelect.value = this.settings.model;
            this.updateModelBadgeName();
        } catch (e) {
            console.warn('Catálogo de modelos indisponível');
        }
    }

    updateModelBadgeName() {
        const m = this.models.find(m => m.id === this.settings.model);
        if (window.updateModelBadge) window.updateModelBadge(m ? m.name : '');
    }

    applySettings() {
        if (this.$.speedRange) {
            this.$.speedRange.value = this.settings.speed;
            this.updateSpeedLabel();
        }
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
            const text = result[0].transcript.trim();

            // Interrupção por voz (barge-in) enquanto a ARIA fala
            if (this.state.speaking) {
                if (this.isLikelyEcho(text)) return;
                console.log('🖐️ Interrompida por voz:', text);
                this.stopAudio();
            }

            this.transcript = text;

            // Mostrar texto em tempo real
            this.showTranscript(this.transcript, !result.isFinal);
            
            // Limpar timeout anterior
            if (this.speechTimeout) clearTimeout(this.speechTimeout);
            
            if (result.isFinal) {
                this.processTranscript();
            } else {
                // Processar após silêncio (reduzido para resposta mais rápida)
                const timeout = this.isMobile ? 800 : 500;
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

            // Manter a escuta de interrupção viva enquanto a ARIA fala
            if (this.bargeInActive && this.state.speaking) {
                setTimeout(() => {
                    if (this.bargeInActive && this.state.speaking) {
                        try { this.recognition.start(); } catch (e) {}
                    }
                }, 150);
                return;
            }

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
                    this.showMicrophonePermissionBanner();
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

    showMicrophonePermissionBanner() {
        if (document.getElementById('micPermissionBanner')) return;
        const banner = document.createElement('div');
        banner.id = 'micPermissionBanner';
        banner.className = 'permissions-banner';
        banner.innerHTML = `
            <div class="banner-text">Permissão de microfone bloqueada. <button id="micBannerOpen">Como liberar</button></div>
            <button id="micBannerDismiss" aria-label="Fechar">×</button>
        `;
        document.body.appendChild(banner);

        document.getElementById('micBannerDismiss').addEventListener('click', () => banner.remove());
        document.getElementById('micBannerOpen').addEventListener('click', () => {
            // Mostrar instruções simples inline
            alert('Abra \nConfigurações -> Safari/Chrome -> Microfone -> Permitir para aria-voice.vercel.app');
        });
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
            // Ensure mic stream is obtained early (useful for iOS / permission prompt)
            if (!this.micStream && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                try {
                    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    if (window.startAudioVisualization) window.startAudioVisualization(this.micStream);
                } catch (e) {
                    // Don't block recognition start if the mic stream fails here
                }
            }
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
    
    // ============================================
    // BARGE-IN: interromper a ARIA falando por cima
    // ============================================

    startBargeIn() {
        if (!this.settings.bargeIn || !this.recognition) return;
        // No iOS, microfone + reprodução simultâneos derrubam o áudio; usuário interrompe pelo toque
        if (this.isIOS) return;
        if (this.state.listening || this.bargeInActive) return;
        this.bargeInActive = true;
        try {
            this.recognition.start();
            console.log('👂 Escuta de interrupção ativa');
        } catch (e) {
            this.bargeInActive = false;
        }
    }

    stopBargeIn() {
        this.bargeInActive = false;
    }

    // Ignora o eco da própria ARIA captado pelo microfone
    isLikelyEcho(text) {
        const norm = s => s.toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        const t = norm(text);
        if (!t || t.split(' ').length < 2) return true; // curto demais para valer como interrupção
        const last = norm(this.lastResponse || '');
        return last.includes(t);
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
            const timeoutId = setTimeout(() => controller.abort(), 45000); // chat + TTS podem levar vários segundos
            
            const res = await fetch('/api/chat-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    sessionId: this.state.sessionId,
                    model: this.settings.model
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
            console.log('📥 Resposta:', data.response?.substring(0, 50), `[${data.time}ms]`);

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

            // Pipeline: sintetiza por sentença em paralelo e toca em ordem
            await this.speakPipelined(data.response);
            
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
            
            // Feedback visível para o usuário
            const friendly = error.name === 'AbortError'
                ? 'A resposta demorou demais. Tente novamente.'
                : 'Não consegui responder agora. Verifique sua conexão e tente novamente.';
            this.showNotification(friendly, 'error');

            // Tentar falar erro no mobile
            if (this.isMobile && error.name === 'AbortError') {
                this.speakWithBrowser('Desculpe, a conexão demorou muito. Tente novamente.');
            }
        }
    }
    
    // ============================================
    // PIPELINE DE FALA: TTS por sentença, paralelo e ordenado
    // ============================================

    async speakPipelined(text) {
        // iOS sem áudio desbloqueado: TTS nativo direto
        if (this.isIOS && !this.audioUnlocked) {
            return this.speakWithBrowser(text);
        }

        const sentences = this.splitTextIntoChunks(text, 180);
        if (sentences.length === 0) return;

        this.state.speaking = true;
        this.state.processing = false;
        this.$.orb.classList.add('speaking');
        this.startBargeIn();

        this.ttsAbort = new AbortController();
        const signal = this.ttsAbort.signal;

        // Promessas ordenadas: o consumidor toca i assim que i estiver pronto
        const resolvers = [];
        const ready = sentences.map(() => new Promise(r => resolvers.push(r)));

        // Produtores com janela de concorrência (prefetch das próximas sentenças)
        const MAX_CONCURRENT = 2;
        let nextIdx = 0;
        const worker = async () => {
            while (nextIdx < sentences.length && !signal.aborted) {
                const i = nextIdx++;
                try {
                    const r = await fetch('/api/tts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: sentences[i] }),
                        signal
                    });
                    const d = r.ok ? await r.json() : null;
                    resolvers[i](d?.audioBase64 ? d : null);
                } catch (e) {
                    resolvers[i](null);
                }
            }
        };
        for (let w = 0; w < MAX_CONCURRENT; w++) worker();

        // Consumidor: reprodução sequencial; fallback por sentença no navegador
        let browserVoice = null;
        try {
            for (let i = 0; i < sentences.length; i++) {
                if (!this.state.speaking || signal.aborted) break;
                const d = await ready[i];
                if (!this.state.speaking || signal.aborted) break;

                if (d) {
                    await this.playChunkAudio(d.audioBase64, d.audioMime || 'audio/mpeg');
                } else if ('speechSynthesis' in window) {
                    if (!browserVoice) browserVoice = this.getBestFemaleVoice();
                    await this.speakChunk(sentences[i], browserVoice);
                }
            }
        } finally {
            this.ttsAbort.abort();
            this.state.speaking = false;
            this.$.orb.classList.remove('speaking');
            this.stopBargeIn();
        }
    }

    // Toca um trecho de áudio; estado de fala é gerenciado pelo pipeline
    playChunkAudio(base64, mime) {
        return new Promise((resolve) => {
            const audio = new Audio();
            this.currentAudio = audio;
            audio.setAttribute('playsinline', 'true');
            audio.setAttribute('webkit-playsinline', 'true');
            try { audio.playsInline = true; } catch (e) {}

            try {
                const bytes = atob(base64);
                const arr = new Uint8Array(bytes.length);
                for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
                audio.src = URL.createObjectURL(new Blob([arr], { type: mime }));
            } catch (e) {
                audio.src = `data:${mime};base64,${base64}`;
            }

            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
                resolve();
            };

            audio.onended = finish;
            audio.onerror = finish;
            audio.onpause = () => {
                // pausa manual (interrupção) encerra o trecho; fim natural dispara onended antes
                if (audio.currentTime < audio.duration) finish();
            };

            audio.play().catch(finish);
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
                this.startBargeIn();

                const voice = this.getBestFemaleVoice();

                for (let i = 0; i < chunks.length; i++) {
                    if (!this.state.speaking) break; // Interrompido

                    await this.speakChunk(chunks[i], voice);
                }

                this.state.speaking = false;
                this.$.orb.classList.remove('speaking');
                this.stopBargeIn();
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
    
    
    stopAudio() {
        // Cancela o pipeline de TTS (fetches pendentes e próximos trechos)
        if (this.ttsAbort) this.ttsAbort.abort();

        // Parar o áudio em reprodução no momento (instância local do TTS)
        if (this.currentAudio) {
            try {
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
            } catch (e) {}
            this.currentAudio = null;
        }

        // Parar TTS do navegador também
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        
        this.state.speaking = false;
        this.$.orb.classList.remove('speaking');
        this.bargeInActive = false;
    }

    // ============================================
    // UI
    // ============================================
    
    setupEventListeners() {
        // Clique no orb
        this.$.orb.addEventListener('click', async () => {
            // Ensure audio unlocked during orb press (extra safety)
            if (!this.audioUnlocked) await this.unlockAudio();
            // Haptic feedback para mobile
            if (this.isMobile && navigator.vibrate) {
                navigator.vibrate(50);
            }
            
            if (this.state.speaking) {
                this.stopAudio();
                // Após interromper, já começa a escutar
                setTimeout(() => this.startListening(), 250);
            } else if (this.state.listening) {
                this.stopListening();
            } else if (!this.state.processing) {
                this.startListening();
            }
        });
        
        // Configurações - adicionar touch e click para melhor resposta
        const toggleSettings = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.$.settingsPanel.classList.toggle('open');
        };
        this.$.settingsBtn?.addEventListener('click', toggleSettings);
        this.$.settingsBtn?.addEventListener('touchend', toggleSettings, { passive: false });
        
        // Fechar configurações ao clicar fora
        document.addEventListener('click', (e) => {
            if (this.$.settingsPanel?.classList.contains('open') &&
                !this.$.settingsPanel.contains(e.target) &&
                !this.$.settingsBtn?.contains(e.target)) {
                this.$.settingsPanel.classList.remove('open');
            }
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
            this.updateModelBadgeName();
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

        // Toggle interromper por voz (barge-in)
        const bargeInToggle = document.getElementById('bargeInToggle');
        if (bargeInToggle) {
            bargeInToggle.checked = this.settings.bargeIn;
            bargeInToggle.addEventListener('change', (e) => {
                this.settings.bargeIn = e.target.checked;
                this.saveSettings();
                const status = e.target.checked ? 'Interrupção por voz ativada' : 'Interrupção por voz desativada';
                this.showNotification(status, 'info');
            });
        }
        
        // Limpar conversa
        this.$.clearBtn?.addEventListener('click', async () => {
            if (!confirm('Apagar toda a conversa?')) return;
            try {
                await fetch('/api/clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: this.state.sessionId })
                });
            } catch (e) {}
            this.state.sessionId = `session_${Date.now()}`;
            if (window.clearChatMessages) window.clearChatMessages();
            this.$.settingsPanel.classList.remove('open');
            this.showNotification('Conversa apagada', 'info');
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

// Registrar service worker (PWA/offline)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.log('Service worker não registrado:', err);
        });
    });
}

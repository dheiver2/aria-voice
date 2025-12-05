/**
 * ARIA Voice PRO - App Principal
 * Versão 3.0 com recursos avançados
 */

class ARIAVoicePRO {
    constructor() {
        // Elementos DOM
        this.elements = {
            orbContainer: document.getElementById('orbContainer'),
            orb: document.getElementById('orb'),
            stateText: document.getElementById('stateText'),
            stateIcon: document.getElementById('stateIcon'),
            audioPlayer: document.getElementById('audioPlayer'),
            volumeRing: document.getElementById('volumeRing'),
            volumeFill: document.querySelector('.volume-fill'),
            soundRings: document.getElementById('soundRings'),
            waveformContainer: document.getElementById('waveformContainer'),
            waveformCanvas: document.getElementById('waveformCanvas'),
            particleCanvas: document.getElementById('particleCanvas'),
            sentimentDisplay: document.getElementById('sentimentDisplay'),
            sentimentEmoji: document.getElementById('sentimentEmoji'),
            settingsPanel: document.getElementById('settingsPanel'),
            settingsBtn: document.getElementById('settingsBtn'),
            closeSettings: document.getElementById('closeSettings'),
            memoryCount: document.getElementById('memoryCount'),
            memoryInfo: document.getElementById('memoryInfo'),
            memoryList: document.getElementById('memoryList'),
            voiceSelect: document.getElementById('voiceSelect'),
            speedRange: document.getElementById('speedRange'),
            speedValue: document.getElementById('speedValue'),
            wakeWordToggle: document.getElementById('wakeWordToggle'),
            continuousToggle: document.getElementById('continuousToggle'),
            clearMemory: document.getElementById('clearMemory')
        };
        
        // Estado
        this.state = {
            isListening: false,
            isProcessing: false,
            isSpeaking: false,
            currentState: 'idle',
            sessionId: 'session_' + Date.now(),
            lastAudioUrl: null,
            retryCount: 0
        };
        
        // Configurações
        this.settings = {
            voice: 'francisca',
            speed: 0,
            wakeWord: false,
            continuous: true
        };
        
        // Áudio
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.recognition = null;
        
        // Animação
        this.particles = [];
        this.animationFrame = null;
        
        // Inicializar
        this.init();
    }
    
    async init() {
        console.log('🚀 ARIA Voice PRO inicializando...');
        
        await this.loadSettings();
        await this.loadMemory();
        this.setupSpeechRecognition();
        this.setupAudioAnalyser();
        this.setupParticles();
        this.setupWaveform();
        this.setupEventListeners();
        this.preloadAPI();
        
        // Iniciar após delay
        setTimeout(() => {
            if (this.settings.continuous) {
                this.startListening();
            }
        }, 1000);
        
        console.log('✅ ARIA Voice PRO pronto!');
    }
    
    // ============================================
    // CONFIGURAÇÕES E MEMÓRIA
    // ============================================
    
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
            console.warn('Erro ao salvar configurações');
        }
    }
    
    applySettings() {
        if (this.elements.voiceSelect) {
            this.elements.voiceSelect.value = this.settings.voice;
        }
        if (this.elements.speedRange) {
            this.elements.speedRange.value = this.settings.speed;
            this.updateSpeedLabel();
        }
        if (this.elements.wakeWordToggle) {
            this.elements.wakeWordToggle.checked = this.settings.wakeWord;
        }
        if (this.elements.continuousToggle) {
            this.elements.continuousToggle.checked = this.settings.continuous;
        }
    }
    
    updateSpeedLabel() {
        const val = parseInt(this.elements.speedRange.value);
        let label = 'Normal';
        if (val > 0) label = `+${val}% Rápido`;
        if (val < 0) label = `${val}% Lento`;
        this.elements.speedValue.textContent = label;
        this.settings.speed = val;
    }
    
    async loadMemory() {
        try {
            const res = await fetch('/api/memory');
            const data = await res.json();
            this.updateMemoryUI(data);
        } catch (e) {
            console.warn('Erro ao carregar memória');
        }
    }
    
    updateMemoryUI(data) {
        const count = data.facts?.length || 0;
        this.elements.memoryCount.textContent = count;
        this.elements.memoryInfo.textContent = `${count} lembranças salvas`;
        
        if (this.elements.memoryList) {
            this.elements.memoryList.innerHTML = data.facts?.slice(-10).map(fact => 
                `<div class="memory-item">${fact}</div>`
            ).join('') || '<p style="color: var(--text-muted); font-size: 13px;">Nenhuma lembrança ainda</p>';
        }
    }
    
    async clearMemoryData() {
        if (!confirm('Limpar toda a memória da ARIA?')) return;
        
        try {
            await fetch('/api/memory', { method: 'DELETE' });
            await this.loadMemory();
        } catch (e) {
            console.error('Erro ao limpar memória');
        }
    }
    
    preloadAPI() {
        fetch('/api/health').catch(() => {});
    }
    
    // ============================================
    // RECONHECIMENTO DE VOZ
    // ============================================
    
    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            console.error('Speech Recognition não suportado');
            this.setState('error');
            return;
        }
        
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'pt-BR';
        this.recognition.maxAlternatives = 1;
        
        this.recognition.onstart = () => {
            this.state.isListening = true;
            this.setState('listening');
        };
        
        this.recognition.onresult = (event) => {
            const lastResult = event.results[event.results.length - 1];
            
            if (lastResult.isFinal) {
                const transcript = lastResult[0].transcript.trim();
                
                if (transcript) {
                    // Wake word check
                    if (this.settings.wakeWord && !this.isWakeWordActive) {
                        if (this.checkWakeWord(transcript)) {
                            this.isWakeWordActive = true;
                            this.playFeedback('wake');
                            return;
                        }
                        return;
                    }
                    
                    // Comandos especiais
                    if (this.handleSpecialCommands(transcript)) {
                        return;
                    }
                    
                    this.isWakeWordActive = false;
                    this.stopListening();
                    this.processVoice(transcript);
                }
            }
        };
        
        this.recognition.onerror = (event) => {
            console.warn('Erro reconhecimento:', event.error);
            this.state.isListening = false;
            
            if (event.error === 'not-allowed') {
                this.setState('error');
                this.elements.stateText.textContent = 'Microfone bloqueado';
                return;
            }
            
            if (['network', 'service-not-allowed'].includes(event.error)) {
                this.retryWithBackoff();
            } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
                setTimeout(() => this.startListening(), 1000);
            } else {
                setTimeout(() => this.startListening(), 200);
            }
        };
        
        this.recognition.onend = () => {
            this.state.isListening = false;
            
            if (!this.state.isProcessing && !this.state.isSpeaking && this.settings.continuous) {
                setTimeout(() => this.startListening(), 200);
            }
        };
    }
    
    checkWakeWord(text) {
        const lowerText = text.toLowerCase();
        return lowerText.includes('aria') || 
               lowerText.includes('ei aria') ||
               lowerText.includes('oi aria') ||
               lowerText.includes('olá aria');
    }
    
    handleSpecialCommands(text) {
        const lowerText = text.toLowerCase().trim();
        
        // Parar
        if (['pare', 'para', 'stop', 'silêncio', 'cala a boca'].some(cmd => lowerText.includes(cmd))) {
            if (this.state.isSpeaking) {
                this.stopSpeaking();
                return true;
            }
        }
        
        // Nova conversa
        if (['nova conversa', 'recomeçar', 'limpar conversa', 'novo chat'].some(cmd => lowerText.includes(cmd))) {
            this.clearConversation();
            return true;
        }
        
        // Repetir
        if (['repita', 'repetir', 'de novo', 'outra vez'].some(cmd => lowerText.includes(cmd))) {
            if (this.state.lastAudioUrl) {
                this.playAudio(this.state.lastAudioUrl);
                return true;
            }
        }
        
        return false;
    }
    
    async clearConversation() {
        try {
            await fetch('/api/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.state.sessionId })
            });
            this.state.sessionId = 'session_' + Date.now();
            this.showSentiment('🔄');
            setTimeout(() => this.hideSentiment(), 1500);
        } catch (e) {
            console.error('Erro ao limpar conversa');
        }
    }
    
    retryWithBackoff() {
        if (this.state.retryCount >= 3) {
            this.setState('error');
            this.state.retryCount = 0;
            return;
        }
        
        const delay = Math.pow(2, this.state.retryCount) * 1000;
        this.state.retryCount++;
        setTimeout(() => this.startListening(), delay);
    }
    
    startListening() {
        if (!this.recognition) return;
        if (this.state.isListening || this.state.isProcessing || this.state.isSpeaking) return;
        
        try {
            this.recognition.start();
            this.state.retryCount = 0;
        } catch (e) {
            console.warn('Já está ouvindo');
        }
    }
    
    stopListening() {
        if (this.recognition && this.state.isListening) {
            this.recognition.stop();
            this.state.isListening = false;
        }
    }
    
    // ============================================
    // PROCESSAMENTO DE VOZ
    // ============================================
    
    async processVoice(text) {
        this.state.isProcessing = true;
        this.setState('thinking');
        
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);
            
            const speedStr = this.settings.speed >= 0 ? `+${this.settings.speed}%` : `${this.settings.speed}%`;
            
            const res = await fetch('/api/voice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    sessionId: this.state.sessionId,
                    voice: this.settings.voice
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            if (!res.ok) throw new Error('Erro na API');
            
            const data = await res.json();
            this.state.isProcessing = false;
            
            // Mostrar sentimento
            this.showSentimentFromAnalysis(data.sentiment);
            
            // Atualizar memória UI
            this.loadMemory();
            
            if (data.audioUrl) {
                this.state.lastAudioUrl = data.audioUrl;
                await this.playAudio(data.audioUrl);
            } else {
                this.setState('idle');
                if (this.settings.continuous) {
                    setTimeout(() => this.startListening(), 500);
                }
            }
            
        } catch (error) {
            console.error('Erro:', error);
            this.state.isProcessing = false;
            this.setState('error');
            
            setTimeout(() => {
                this.setState('idle');
                if (this.settings.continuous) {
                    this.startListening();
                }
            }, 2000);
        }
    }
    
    showSentimentFromAnalysis(sentiment) {
        const emojis = {
            positive: '😊',
            negative: '😔',
            curious: '🤔',
            neutral: '😐'
        };
        
        this.showSentiment(emojis[sentiment] || '😐');
        setTimeout(() => this.hideSentiment(), 3000);
    }
    
    showSentiment(emoji) {
        this.elements.sentimentEmoji.textContent = emoji;
        this.elements.sentimentDisplay.classList.add('visible');
    }
    
    hideSentiment() {
        this.elements.sentimentDisplay.classList.remove('visible');
    }
    
    // ============================================
    // ÁUDIO
    // ============================================
    
    async playAudio(url) {
        return new Promise((resolve, reject) => {
            this.state.isSpeaking = true;
            this.setState('speaking');
            
            this.elements.audioPlayer.src = url + '?t=' + Date.now();
            this.elements.audioPlayer.load();
            
            this.elements.audioPlayer.oncanplaythrough = () => {
                this.elements.audioPlayer.play()
                    .then(resolve)
                    .catch(reject);
            };
            
            this.elements.audioPlayer.onended = () => {
                this.state.isSpeaking = false;
                this.setState('idle');
                
                if (this.settings.continuous) {
                    setTimeout(() => this.startListening(), 400);
                }
            };
            
            this.elements.audioPlayer.onerror = () => {
                this.state.isSpeaking = false;
                this.setState('error');
                reject(new Error('Erro no áudio'));
            };
        });
    }
    
    stopSpeaking() {
        this.elements.audioPlayer.pause();
        this.elements.audioPlayer.currentTime = 0;
        this.state.isSpeaking = false;
        this.setState('idle');
        
        if (this.settings.continuous) {
            setTimeout(() => this.startListening(), 200);
        }
    }
    
    playFeedback(type) {
        // Som de feedback simples usando AudioContext
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        
        oscillator.frequency.value = type === 'wake' ? 880 : 440;
        oscillator.type = 'sine';
        
        gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.2);
    }
    
    // ============================================
    // ANALISADOR DE ÁUDIO
    // ============================================
    
    async setupAudioAnalyser() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            
            this.monitorVolume();
        } catch (e) {
            console.warn('Não foi possível acessar microfone');
        }
    }
    
    monitorVolume() {
        if (!this.analyser) return;
        
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        const circumference = 597; // 2 * π * 95
        
        const update = () => {
            this.analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
            
            // Atualizar anel de volume
            if (this.state.isListening && this.elements.volumeFill) {
                const normalized = Math.min(avg / 128, 1);
                const offset = circumference - (normalized * circumference);
                this.elements.volumeFill.style.strokeDashoffset = offset;
            } else if (this.elements.volumeFill) {
                this.elements.volumeFill.style.strokeDashoffset = circumference;
            }
            
            requestAnimationFrame(update);
        };
        
        update();
    }
    
    // ============================================
    // PARTÍCULAS DE FUNDO
    // ============================================
    
    setupParticles() {
        const canvas = this.elements.particleCanvas;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);
        
        // Criar partículas
        for (let i = 0; i < 80; i++) {
            this.particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 1,
                alpha: Math.random() * 0.5 + 0.2
            });
        }
        
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Desenhar conexões
            ctx.strokeStyle = 'rgba(0, 245, 255, 0.1)';
            ctx.lineWidth = 0.5;
            
            for (let i = 0; i < this.particles.length; i++) {
                for (let j = i + 1; j < this.particles.length; j++) {
                    const dx = this.particles[i].x - this.particles[j].x;
                    const dy = this.particles[i].y - this.particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.moveTo(this.particles[i].x, this.particles[i].y);
                        ctx.lineTo(this.particles[j].x, this.particles[j].y);
                        ctx.globalAlpha = (1 - dist / 150) * 0.3;
                        ctx.stroke();
                    }
                }
            }
            
            // Desenhar e mover partículas
            this.particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                
                if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
                if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
                
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 245, 255, ${p.alpha})`;
                ctx.globalAlpha = 1;
                ctx.fill();
            });
            
            this.animationFrame = requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    // ============================================
    // WAVEFORM
    // ============================================
    
    setupWaveform() {
        const canvas = this.elements.waveformCanvas;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        canvas.width = 200;
        canvas.height = 60;
        
        const drawWaveform = () => {
            if (!this.state.isSpeaking || !this.analyser) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                requestAnimationFrame(drawWaveform);
                return;
            }
            
            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(dataArray);
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const barWidth = 3;
            const gap = 2;
            const bars = Math.floor(canvas.width / (barWidth + gap));
            
            for (let i = 0; i < bars; i++) {
                const dataIndex = Math.floor(i * dataArray.length / bars);
                const value = dataArray[dataIndex];
                const height = (value / 255) * canvas.height * 0.8;
                const x = i * (barWidth + gap);
                const y = (canvas.height - height) / 2;
                
                const gradient = ctx.createLinearGradient(0, y, 0, y + height);
                gradient.addColorStop(0, '#ff00ff');
                gradient.addColorStop(1, '#00f5ff');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x, y, barWidth, height);
            }
            
            requestAnimationFrame(drawWaveform);
        };
        
        drawWaveform();
    }
    
    // ============================================
    // ESTADO
    // ============================================
    
    setState(state) {
        this.state.currentState = state;
        
        // Atualizar classes do orb
        this.elements.orbContainer.classList.remove('idle', 'listening', 'thinking', 'speaking', 'error');
        this.elements.orbContainer.classList.add(state);
        
        // Atualizar texto
        const stateTexts = {
            idle: 'Toque para falar',
            listening: 'Ouvindo...',
            thinking: 'Pensando...',
            speaking: 'Falando...',
            error: 'Erro'
        };
        this.elements.stateText.textContent = stateTexts[state] || '';
        
        // Atualizar waveform visibility
        if (state === 'speaking') {
            this.elements.waveformContainer.classList.add('active');
        } else {
            this.elements.waveformContainer.classList.remove('active');
        }
        
        // Vibração mobile
        if (navigator.vibrate) {
            if (state === 'listening') navigator.vibrate(50);
            if (state === 'error') navigator.vibrate([100, 50, 100]);
        }
    }
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    
    setupEventListeners() {
        // Orb click
        this.elements.orbContainer.addEventListener('click', () => {
            if (this.state.isSpeaking) {
                this.stopSpeaking();
            } else if (this.state.isListening) {
                this.stopListening();
                this.setState('idle');
            } else {
                this.startListening();
            }
        });
        
        // Settings panel
        this.elements.settingsBtn.addEventListener('click', () => {
            this.elements.settingsPanel.classList.add('open');
        });
        
        this.elements.closeSettings.addEventListener('click', () => {
            this.elements.settingsPanel.classList.remove('open');
        });
        
        // Voice select
        this.elements.voiceSelect.addEventListener('change', (e) => {
            this.settings.voice = e.target.value;
            this.saveSettings();
        });
        
        // Speed range
        this.elements.speedRange.addEventListener('input', () => {
            this.updateSpeedLabel();
            this.saveSettings();
        });
        
        // Toggles
        this.elements.wakeWordToggle.addEventListener('change', (e) => {
            this.settings.wakeWord = e.target.checked;
            this.saveSettings();
        });
        
        this.elements.continuousToggle.addEventListener('change', (e) => {
            this.settings.continuous = e.target.checked;
            this.saveSettings();
            
            if (this.settings.continuous && !this.state.isListening && !this.state.isSpeaking) {
                this.startListening();
            }
        });
        
        // Clear memory
        this.elements.clearMemory.addEventListener('click', () => {
            this.clearMemoryData();
        });
        
        // Quick actions
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                
                switch (action) {
                    case 'clear':
                        this.clearConversation();
                        break;
                    case 'repeat':
                        if (this.state.lastAudioUrl) {
                            this.playAudio(this.state.lastAudioUrl);
                        }
                        break;
                    case 'stop':
                        this.stopSpeaking();
                        this.stopListening();
                        this.setState('idle');
                        break;
                }
            });
        });
        
        // Visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopListening();
            } else if (this.settings.continuous && !this.state.isSpeaking) {
                setTimeout(() => this.startListening(), 500);
            }
        });
        
        // Click outside settings to close
        document.addEventListener('click', (e) => {
            if (this.elements.settingsPanel.classList.contains('open') &&
                !this.elements.settingsPanel.contains(e.target) &&
                e.target !== this.elements.settingsBtn) {
                this.elements.settingsPanel.classList.remove('open');
            }
        });
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    window.aria = new ARIAVoicePRO();
});

// Service Worker para PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}

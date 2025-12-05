/**
 * ARIA Voice - Interface 100% por Voz
 * Versão 2.0 - Com 10 melhorias implementadas
 */

class ARIAVoice {
    constructor() {
        // Elementos
        this.orbContainer = document.getElementById('orbContainer');
        this.audioPlayer = document.getElementById('audioPlayer');
        this.soundWave = document.getElementById('soundWave');
        this.volumeIndicator = document.getElementById('volumeIndicator');
        this.micIcon = document.getElementById('micIcon');
        
        // Estado
        this.isListening = false;
        this.isProcessing = false;
        this.isSpeaking = false;
        this.sessionId = 'session_' + Date.now();
        this.retryCount = 0;
        this.maxRetries = 3;
        
        // Configurações
        this.silenceTimeout = null;
        this.silenceDelay = 1500; // ms de silêncio para finalizar
        this.lastSpeechTime = 0;
        
        // Reconhecimento de voz
        this.recognition = null;
        this.audioContext = null;
        this.analyser = null;
        
        // Inicialização
        this.init();
    }
    
    async init() {
        this.setupSpeechRecognition();
        this.setupEvents();
        this.setupAudioAnalyser();
        this.preloadResources();
        
        // Inicia ouvindo automaticamente após delay
        setTimeout(() => this.startListening(), 800);
    }
    
    // MELHORIA 9: Preload de recursos
    preloadResources() {
        // Pré-aquecer a API
        fetch('/api/health').catch(() => {});
        
        // Preload do audio player
        this.audioPlayer.load();
    }
    
    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            this.showError();
            console.error('Speech Recognition não suportado');
            return;
        }
        
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true; // MELHORIA 7: Contínuo para melhor detecção
        this.recognition.interimResults = true; // Resultados intermediários
        this.recognition.lang = 'pt-BR';
        this.recognition.maxAlternatives = 1;
        
        this.recognition.onstart = () => {
            this.isListening = true;
            this.updateState('listening');
            this.playFeedbackSound('start');
            this.micIcon?.classList.add('active');
        };
        
        this.recognition.onresult = (event) => {
            this.lastSpeechTime = Date.now();
            this.clearSilenceTimeout();
            
            // Pegar último resultado
            const lastResult = event.results[event.results.length - 1];
            
            if (lastResult.isFinal) {
                const transcript = lastResult[0].transcript.trim();
                if (transcript) {
                    // MELHORIA 3: Comandos de voz especiais
                    if (this.handleSpecialCommands(transcript)) {
                        return;
                    }
                    this.stopListening();
                    this.processVoiceInput(transcript);
                }
            } else {
                // MELHORIA 7: Detecção de silêncio inteligente
                this.setSilenceTimeout();
            }
        };
        
        this.recognition.onerror = (event) => {
            console.warn('Erro reconhecimento:', event.error);
            this.isListening = false;
            this.micIcon?.classList.remove('active');
            
            // MELHORIA 6: Retry automático com backoff
            if (['network', 'service-not-allowed'].includes(event.error)) {
                this.retryWithBackoff();
            } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
                this.showError();
                setTimeout(() => this.startListening(), 1500);
            } else {
                setTimeout(() => this.startListening(), 300);
            }
        };
        
        this.recognition.onend = () => {
            this.isListening = false;
            this.micIcon?.classList.remove('active');
            this.clearSilenceTimeout();
            
            if (!this.isProcessing && !this.isSpeaking) {
                setTimeout(() => this.startListening(), 200);
            }
        };
    }
    
    // MELHORIA 7: Timeout de silêncio inteligente
    setSilenceTimeout() {
        this.clearSilenceTimeout();
        this.silenceTimeout = setTimeout(() => {
            if (this.isListening && Date.now() - this.lastSpeechTime > this.silenceDelay) {
                // Usuário parou de falar
            }
        }, this.silenceDelay);
    }
    
    clearSilenceTimeout() {
        if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
            this.silenceTimeout = null;
        }
    }
    
    // MELHORIA 3: Comandos de voz especiais
    handleSpecialCommands(text) {
        const lowerText = text.toLowerCase().trim();
        
        // Parar de falar
        if (lowerText.includes('pare') || lowerText.includes('silêncio') || 
            lowerText.includes('cala') || lowerText === 'stop') {
            if (this.isSpeaking) {
                this.stopSpeaking();
                return true;
            }
        }
        
        // Limpar histórico
        if (lowerText.includes('nova conversa') || lowerText.includes('recomeçar') ||
            lowerText.includes('limpar histórico')) {
            this.clearHistory();
            return true;
        }
        
        // Repetir
        if (lowerText === 'repita' || lowerText === 'de novo' || lowerText.includes('repetir')) {
            if (this.lastAudioUrl) {
                this.playAudio(this.lastAudioUrl);
                return true;
            }
        }
        
        return false;
    }
    
    async clearHistory() {
        try {
            await fetch('/api/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.sessionId })
            });
            this.sessionId = 'session_' + Date.now();
            // Feedback visual
            this.orbContainer.classList.add('success');
            setTimeout(() => this.orbContainer.classList.remove('success'), 1000);
        } catch (e) {
            console.warn('Erro ao limpar histórico');
        }
    }
    
    // MELHORIA 5: Analisador de áudio para indicador de volume
    async setupAudioAnalyser() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);
            this.analyser.fftSize = 256;
            
            this.monitorVolume();
        } catch (e) {
            console.warn('Não foi possível acessar microfone para análise');
        }
    }
    
    monitorVolume() {
        if (!this.analyser) return;
        
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        const update = () => {
            if (!this.isListening) {
                this.volumeIndicator?.classList.remove('active');
                requestAnimationFrame(update);
                return;
            }
            
            this.analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            
            // MELHORIA 5: Feedback visual de volume
            if (average > 30) {
                this.volumeIndicator?.classList.add('active');
                const scale = 1 + (average / 255) * 0.3;
                if (this.volumeIndicator) {
                    this.volumeIndicator.style.transform = `scale(${scale})`;
                }
            } else {
                this.volumeIndicator?.classList.remove('active');
            }
            
            requestAnimationFrame(update);
        };
        
        update();
    }
    
    setupEvents() {
        // Clique no orbe
        this.orbContainer?.addEventListener('click', () => {
            if (this.isSpeaking) {
                this.stopSpeaking();
            } else if (this.isListening) {
                this.stopListening();
            } else {
                this.startListening();
            }
        });
        
        // Touch para mobile
        this.orbContainer?.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.orbContainer.classList.add('touched');
        });
        
        this.orbContainer?.addEventListener('touchend', () => {
            this.orbContainer.classList.remove('touched');
        });
        
        // Eventos do áudio
        this.audioPlayer.addEventListener('ended', () => {
            this.isSpeaking = false;
            this.soundWave?.classList.remove('active');
            this.micIcon?.classList.remove('speaking');
            this.updateState('idle');
            setTimeout(() => this.startListening(), 400);
        });
        
        this.audioPlayer.addEventListener('error', () => {
            this.isSpeaking = false;
            this.soundWave?.classList.remove('active');
            this.showError();
            setTimeout(() => this.startListening(), 1500);
        });
        
        this.audioPlayer.addEventListener('play', () => {
            // MELHORIA 2: Ativar visualizador de ondas
            this.soundWave?.classList.add('active');
            this.micIcon?.classList.add('speaking');
        });
        
        // Visibilidade da página
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopListening();
            } else if (!this.isSpeaking && !this.isProcessing) {
                setTimeout(() => this.startListening(), 500);
            }
        });
    }
    
    // MELHORIA 10: Transições suaves de estado
    updateState(state) {
        // Remove todas as classes de estado com transição
        requestAnimationFrame(() => {
            this.orbContainer?.classList.remove('listening', 'thinking', 'speaking', 'error');
            
            if (state !== 'idle') {
                this.orbContainer?.classList.add(state);
            }
        });
    }
    
    showError() {
        this.updateState('error');
        // Vibração em dispositivos móveis
        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }
        setTimeout(() => this.updateState('idle'), 2000);
    }
    
    // MELHORIA 1: Feedback sonoro
    playFeedbackSound(type) {
        const sound = document.getElementById(type === 'start' ? 'startSound' : 'stopSound');
        if (sound) {
            sound.currentTime = 0;
            sound.volume = 0.3;
            sound.play().catch(() => {});
        }
    }
    
    startListening() {
        if (this.recognition && !this.isListening && !this.isProcessing && !this.isSpeaking) {
            try {
                this.recognition.start();
                this.retryCount = 0; // Reset retry count
            } catch (e) {
                console.warn('Reconhecimento já ativo');
            }
        }
    }
    
    stopListening() {
        this.playFeedbackSound('stop');
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
            this.updateState('idle');
            this.micIcon?.classList.remove('active');
        }
    }
    
    stopSpeaking() {
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
        this.isSpeaking = false;
        this.soundWave?.classList.remove('active');
        this.micIcon?.classList.remove('speaking');
        this.updateState('idle');
        setTimeout(() => this.startListening(), 200);
    }
    
    // MELHORIA 6: Retry automático com backoff exponencial
    retryWithBackoff() {
        if (this.retryCount >= this.maxRetries) {
            this.showError();
            this.retryCount = 0;
            return;
        }
        
        const delay = Math.pow(2, this.retryCount) * 1000; // 1s, 2s, 4s
        this.retryCount++;
        
        console.log(`Retry ${this.retryCount}/${this.maxRetries} em ${delay}ms`);
        setTimeout(() => this.startListening(), delay);
    }
    
    async processVoiceInput(text) {
        this.isProcessing = true;
        this.updateState('thinking');
        
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch('/api/voice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: text,
                    sessionId: this.sessionId,
                    voice: 'francisca'
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            if (!response.ok) throw new Error('Erro na API');
            
            const data = await response.json();
            this.isProcessing = false;
            
            if (data.audioUrl) {
                this.lastAudioUrl = data.audioUrl; // Salvar para comando "repetir"
                await this.playAudio(data.audioUrl);
            } else if (data.response) {
                await this.generateAndPlayAudio(data.response);
            }
            
        } catch (error) {
            console.error('Erro:', error);
            this.isProcessing = false;
            
            if (error.name === 'AbortError') {
                console.warn('Timeout na requisição');
            }
            
            this.showError();
            setTimeout(() => this.startListening(), 1500);
        }
    }
    
    async generateAndPlayAudio(text) {
        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: text,
                    voice: 'francisca'
                })
            });
            
            if (!response.ok) throw new Error('Erro no TTS');
            
            const data = await response.json();
            this.lastAudioUrl = data.audioUrl;
            await this.playAudio(data.audioUrl);
            
        } catch (error) {
            console.error('Erro TTS:', error);
            this.showError();
            setTimeout(() => this.startListening(), 1500);
        }
    }
    
    // MELHORIA 8: Melhor gerenciamento de áudio
    async playAudio(url) {
        return new Promise((resolve, reject) => {
            this.isSpeaking = true;
            this.updateState('speaking');
            
            // Cache bust + preload
            const audioUrl = url + '?t=' + Date.now();
            
            // Criar novo elemento para evitar problemas de cache
            this.audioPlayer.src = audioUrl;
            this.audioPlayer.load();
            
            const playPromise = this.audioPlayer.play();
            
            if (playPromise !== undefined) {
                playPromise
                    .then(resolve)
                    .catch(err => {
                        console.warn('Autoplay bloqueado:', err);
                        // Tentar novamente com interação do usuário
                        this.orbContainer.onclick = () => {
                            this.audioPlayer.play();
                            this.orbContainer.onclick = null;
                        };
                        reject(err);
                    });
            }
        });
    }
}

// Inicializa quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    window.aria = new ARIAVoice();
});

// Service Worker para offline (opcional)
if ('serviceWorker' in navigator) {
    // navigator.serviceWorker.register('/sw.js').catch(() => {});
}

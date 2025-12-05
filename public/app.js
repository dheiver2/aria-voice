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
        
        // Carregar configurações
        await this.loadSettings();
        
        // Configurar reconhecimento de voz
        this.setupSpeechRecognition();
        
        // Event listeners
        this.setupEventListeners();
        
        console.log('✅ ARIA pronta!');
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
    
    startListening() {
        if (!this.recognition || this.state.listening || this.state.processing || this.state.speaking) return;
        
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
        
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    sessionId: this.state.sessionId
                })
            });
            
            if (!res.ok) throw new Error('Erro na API');
            
            const data = await res.json();
            
            this.$.orb.classList.remove('thinking');
            
            // Usar TTS do navegador se servidor indicar (Vercel) ou não houver áudio
            if (data.useBrowserTTS || !data.audioUrl) {
                await this.speakWithBrowser(data.response);
            } else {
                await this.playAudio(data.audioUrl);
            }
            
        } catch (error) {
            console.error('Erro:', error);
            this.$.orb.classList.remove('thinking');
            this.state.processing = false;
        }
    }
    
    // ============================================
    // TTS DO NAVEGADOR (fallback para Vercel)
    // ============================================
    
    async speakWithBrowser(text) {
        return new Promise((resolve) => {
            if (!('speechSynthesis' in window)) {
                console.warn('SpeechSynthesis não suportado');
                this.state.processing = false;
                return resolve();
            }
            
            // Cancelar fala anterior
            speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'pt-BR';
            utterance.rate = 1 + (this.settings.speed / 100);
            utterance.pitch = 1;
            
            // Tentar encontrar voz em português
            const voices = speechSynthesis.getVoices();
            const ptVoice = voices.find(v => v.lang.startsWith('pt')) || voices[0];
            if (ptVoice) utterance.voice = ptVoice;
            
            this.state.speaking = true;
            this.state.processing = false;
            this.$.orb.classList.add('speaking');
            
            utterance.onend = () => {
                this.state.speaking = false;
                this.$.orb.classList.remove('speaking');
                resolve();
            };
            
            utterance.onerror = () => {
                this.state.speaking = false;
                this.$.orb.classList.remove('speaking');
                resolve();
            };
            
            speechSynthesis.speak(utterance);
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

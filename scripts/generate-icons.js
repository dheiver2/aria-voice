/**
 * Script para gerar ícones PWA em múltiplos tamanhos
 * Execute: npm install sharp && node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Verificar se sharp está disponível
let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.log('⚠️  Sharp não instalado. Instalando...');
    console.log('Execute: npm install sharp');
    console.log('Depois execute novamente: node scripts/generate-icons.js');
    process.exit(1);
}

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];
const inputSvg = path.join(__dirname, '..', 'public', 'favicon.svg');
const outputDir = path.join(__dirname, '..', 'public', 'icons');

// Criar diretório se não existir
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
    console.log('🎨 Gerando ícones PWA...\n');
    
    for (const size of sizes) {
        const outputPath = path.join(outputDir, `icon-${size}.png`);
        
        try {
            await sharp(inputSvg)
                .resize(size, size)
                .png()
                .toFile(outputPath);
            
            console.log(`✅ icon-${size}.png`);
        } catch (err) {
            console.error(`❌ Erro ao gerar icon-${size}.png:`, err.message);
        }
    }
    
    console.log('\n🎉 Ícones gerados em public/icons/');
}

generateIcons();

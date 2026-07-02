const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

function waitForHealth(port, deadline) {
    return new Promise((resolve, reject) => {
        const attempt = () => {
            fetch(`http://127.0.0.1:${port}/api/health`)
                .then(res => res.json())
                .then(resolve)
                .catch(err => {
                    if (Date.now() > deadline) return reject(err);
                    setTimeout(attempt, 200);
                });
        };
        attempt();
    });
}

test('GET /api/health responde ok e informa versão', async () => {
    const port = 3999;
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: { ...process.env, PORT: String(port), HF_TOKEN: 'test-token' },
        stdio: 'ignore'
    });

    try {
        const body = await waitForHealth(port, Date.now() + 10000);
        assert.strictEqual(body.status, 'ok');
        assert.strictEqual(typeof body.version, 'string');
        assert.strictEqual(body.chat, 'huggingface');
    } finally {
        child.kill('SIGTERM');
    }
});

test('POST /api/login rejeita credenciais inválidas', async () => {
    const port = 4000;
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: { ...process.env, PORT: String(port), HF_TOKEN: 'test-token' },
        stdio: 'ignore'
    });

    try {
        await waitForHealth(port, Date.now() + 10000);
        const res = await fetch(`http://127.0.0.1:${port}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: 'x', password: 'y' })
        });
        assert.strictEqual(res.status, 401);
    } finally {
        child.kill('SIGTERM');
    }
});

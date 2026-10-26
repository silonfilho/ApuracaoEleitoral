const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.static(path.join(__dirname)));

/**
 * Realiza a requisição nativa HTTPS com suporte a descompactação (gzip/deflate)
 */
function fetchTseDirect(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Encoding': 'gzip, deflate',
                'Cache-Control': 'no-cache'
            }
        }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }

            let stream = res;
            const encoding = res.headers['content-encoding'];

            if (encoding === 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
                stream = res.pipe(zlib.createInflate());
            }

            let body = '';
            stream.on('data', chunk => body += chunk.toString('utf8'));
            stream.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (err) {
                    reject(new Error('Erro de parsing no JSON'));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(8000, () => {
            req.destroy();
            reject(new Error('Timeout de conexão com o TSE'));
        });
    });
}

app.get('/api/dados/:uf', async (req, res) => {
    const uf = req.params.uf.toLowerCase();
    const ts = Date.now();

    // URLs Oficiais do TSE para as Eleições 2026 (Código Eleição 6258)
    const urlsTSE = [
        `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/${uf}/${uf}-c0001-e006258-u.json?cb=${ts}`,
        `https://resultados.tse.jus.br/oficial/ele2026/6258/dados-simplificados/${uf}/${uf}-c0001-e006258-r.json?cb=${ts}`,
        `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/${uf}/${uf}-e006258-ab.json?cb=${ts}`
    ];

    for (const url of urlsTSE) {
        try {
            console.log(`[Consumo TSE] A requisitar: ${url}`);
            const data = await fetchTseDirect(url);
            if (data) {
                console.log(`[Consumo TSE] Sucesso ao obter dados!`);
                return res.json(data);
            }
        } catch (e) {
            console.log(`[Consumo TSE] Erro em ${url}: ${e.message}`);
        }
    }

    res.status(404).json({ error: 'Não foi possível obter dados do TSE.' });
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor de Apuração ativo na porta ${PORT}`);
});

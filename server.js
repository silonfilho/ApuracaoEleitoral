const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.static(path.join(__dirname)));

/**
 * Faz requisição HTTP/HTTPS direta à CDN do TSE
 */
function fetchJsonTse(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Cache-Control': 'no-cache'
            }
        };

        https.get(url, options, (res) => {
            console.log(`[TSE Log] URL: ${url} | Status: ${res.statusCode}`);
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', (err) => {
            console.error(`[TSE Erro Conexão]:`, err.message);
            reject(err);
        });
    });
}

/**
 * Consulta a CDN do TSE com URLs estruturadas
 */
async function obterDadosTse(uf) {
    const ufLower = uf.toLowerCase();
    const ts = Date.now();
    
    // Nomenclatura oficial TSE 2026 (Eleição 6258)
    const urls = [
        `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/${ufLower}/${ufLower}-c0001-e006258-u.json?cb=${ts}`,
        `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/${ufLower}/${ufLower}-e006258-ab.json?cb=${ts}`
    ];

    for (const url of urls) {
        try {
            console.log(`[Backend Proxy] A consultar: ${url}`);
            const data = await fetchJsonTse(url);
            if (data) {
                console.log(`[Backend Proxy] Resposta válida recebida do TSE!`);
                return data;
            }
        } catch (err) {
            console.log(`[Backend Proxy] Falha em ${url}: ${err.message}`);
        }
    }
    return null;
}

// Endpoint consumido pela aplicação
app.get('/api/dados/:uf', async (req, res) => {
    const uf = req.params.uf.toLowerCase();
    console.log(`[API Internal] Pedido recebido para UF: ${uf}`);
    try {
        const dados = await obterDadosTse(uf);
        if (dados) {
            return res.json(dados);
        }
        res.status(404).json({ error: 'Dados ainda não publicados pelo TSE' });
    } catch (error) {
        res.status(500).json({ error: 'Erro de processamento' });
    }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor de Apuração ativo na porta ${PORT}`);
});

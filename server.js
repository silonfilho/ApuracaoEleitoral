const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname)));

// Cache interno
let cacheEleicao = {
    nacional: null,
    estados: {},
    ultimaAtualizacao: null
};

/**
 * Função para fazer requisições HTTPs nativas ao TSE ignorando bloqueios de CORS do navegador
 */
function fetchJsonTse(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        };

        https.get(url, options, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Erro HTTP: ${res.statusCode}`));
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
        }).on('error', reject);
    });
}

/**
 * Busca dados com suporte aos múltiplos padrões de URL do TSE
 */
async function obterDadosTse(uf) {
    const ufLower = uf.toLowerCase();
    const urls = [
        `https://resultados.tse.jus.br/oficial/ele2026/6258/dados-simplificados/${ufLower}/${ufLower}-c0001-e006258-r.json`,
        `https://resultados.tse.jus.br/oficial/ele2026/6258/dados-simplificados/${ufLower}/${ufLower}-c0001-e0006258-r.json`,
        `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/${ufLower}/${ufLower}-c0001-e006258-v.json`
    ];

    for (const url of urls) {
        try {
            const data = await fetchJsonTse(url);
            if (data) return data;
        } catch (err) {}
    }
    return null;
}

// Rota de API do Backend para o Frontend consultar
app.get('/api/dados/:uf', async (req, res) => {
    const uf = req.params.uf.toLowerCase();
    try {
        const dados = await obterDadosTse(uf);
        if (dados) {
            return res.json(dados);
        }
        res.status(404).json({ error: 'Dados não encontrados no TSE' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao consultar o TSE' });
    }
});

// Servir a SPA na raiz
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor ativo na porta ${PORT}`);
});

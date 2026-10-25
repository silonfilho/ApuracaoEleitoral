const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.static(path.join(__dirname)));

/**
 * Consulta a CDN do TSE utilizando o fetch nativo do Node.js
 */
async function buscarComProxy(url) {
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://corsproxy.io/?${encodeURIComponent(url)}`
    ];

    for (const proxyUrl of proxies) {
        try {
            console.log(`[Backend Proxy] A tentar: ${proxyUrl}`);
            const res = await fetch(proxyUrl);
            if (res.ok) {
                const data = await res.json();
                if (data && (data.cand || data.candidato || data.pst || data.pstp || data.cagr)) {
                    console.log(`[Backend Proxy] Sucesso ao obter dados do TSE!`);
                    return data;
                }
            }
        } catch (e) {
            console.log(`[Backend Proxy] Erro no proxy: ${e.message}`);
        }
    }
    return null;
}

app.get('/api/dados/:uf', async (req, res) => {
    const uf = req.params.uf.toLowerCase();
    const ts = Date.now();

    const urlsTSE = [
        `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/${uf}/${uf}-c0001-e006258-u.json?cb=${ts}`,
        `https://resultados.tse.jus.br/oficial/ele2026/6258/dados-simplificados/${uf}/${uf}-c0001-e006258-r.json?cb=${ts}`,
        `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/${uf}/${uf}-e006258-ab.json?cb=${ts}`
    ];

    for (const url of urlsTSE) {
        const dados = await buscarComProxy(url);
        if (dados) {
            return res.json(dados);
        }
    }

    res.status(404).json({ error: 'Aguardando publicação do TSE' });
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor de Apuração ativo na porta ${PORT}`);
});

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// URL Oficial do Feed do TSE (Ajustar para o arquivo correto do 2º turno de 2026)
const TSE_URL_BR = 'https://resultados.tse.jus.br/oficial/ele2026/545/dados-simplificados/br/br-c0001-e000545-r.json';

// Cache em Memória para isolar o frontend de falhas de rede do TSE
let cacheDadosBR = {
    pst: "0,00",
    hg: "--:--:--",
    vvc: "0",
    a: "0",
    vb: "0",
    tvn: "0",
    cand: [
        { nm: 'LULA', n: '13', vap: '0', pvap: '0,00' },
        { nm: 'FLÁVIO BOLSONARO', n: '22', vap: '0', pvap: '0,00' }
    ]
};

// Função para buscar dados no TSE e atualizar o Cache
async function atualizarDadosTSE() {
    try {
        const response = await axios.get(TSE_URL_BR, { timeout: 3000 });
        if (response.data) {
            const data = response.data;
            
            // Sanitização e garantia de formato correto
            cacheDadosBR = {
                pst: data.pst || "0,00",
                hg: data.hg || new Date().toTimeString().split(' ')[0],
                vvc: data.vvc || "0",
                a: data.a || "0",
                vb: data.vb || "0",
                tvn: data.tvn || "0",
                cand: (data.cand || []).map(c => ({
                    nm: (c.nm || '').toUpperCase(),
                    n: c.n || '',
                    vap: c.vap || '0',
                    pvap: c.pvap || '0,00'
                }))
            };
        }
    } catch (error) {
        console.warn("[AVISO TSE] Falha temporária ao conectar ao TSE. Mantendo dados do cache.");
    }
}

// Atualiza o cache a cada 3 segundos
setInterval(atualizarDadosTSE, 3000);

// Endpoint que o seu index.html consome
app.get('/api/tse/br', (req, res) => {
    res.json(cacheDadosBR);
});

app.listen(PORT, () => {
    console.log(`[SERVER PRODUÇÃO] Servidor ativo em http://localhost:${PORT}`);
});
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express(); 
app.use(express.static(__dirname));
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

// Histórico simples para alimentar o gráfico (agora preenchido automaticamente)
let historicoGrafico = {
    labels: [],
    lula: [],
    flavio: []
};

// Função auxiliar para normalizar texto
function normalizarTexto(txt) {
    return (txt || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Função para buscar dados no TSE e atualizar o Cache e o Histórico
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

            // Atualização automática do histórico do gráfico
            let pctLula = 0;
            let pctFlavio = 0;

            cacheDadosBR.cand.forEach(c => {
                let nomeNorm = normalizarTexto(c.nm);
                let numCand = c.n || '';
                if (numCand === '13' || nomeNorm.includes('lula')) {
                    pctLula = parseFloat((c.pvap || "0").replace(',', '.'));
                } else if (numCand === '22' || nomeNorm.includes('flavio') || nomeNorm.includes('bolsonaro')) {
                    pctFlavio = parseFloat((c.pvap || "0").replace(',', '.'));
                }
            });

            const horaAtual = cacheDadosBR.hg;
            const pctApurado = parseFloat((cacheDadosBR.pst || "0").replace(',', '.'));

            if (pctApurado > 0 && !historicoGrafico.labels.includes(horaAtual)) {
                if (historicoGrafico.labels.length >= 200) {
                    historicoGrafico.labels.shift();
                    historicoGrafico.lula.shift();
                    historicoGrafico.flavio.shift();
                }
                historicoGrafico.labels.push(horaAtual);
                historicoGrafico.lula.push(pctLula);
                historicoGrafico.flavio.push(pctFlavio);
            }
        }
    } catch (error) {
        console.warn("[AVISO TSE] Falha temporária ao conectar ao TSE. Mantendo dados do cache.");
    }
}

// Atualiza o cache a cada 3 segundos
setInterval(atualizarDadosTSE, 3000);

// Endpoint dinâmico que atende o Brasil ('br') e o histórico
app.get('/api/tse/:uf', (req, res) => {
    const uf = req.params.uf.toLowerCase();
    
    if (uf === 'historico') {
        return res.json(historicoGrafico);
    }

    // Retorna os dados gerais cacheados
    res.json(cacheDadosBR);
});

app.listen(PORT, () => {
    console.log(`[SERVER PRODUÇÃO] Servidor ativo em http://localhost:${PORT}`);
});

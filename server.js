const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express(); 
app.use(express.static(__dirname));
const PORT = process.env.PORT || 3000;

app.use(cors());

// Lista de UFs válidas no Brasil
const UFS_VALIDAS = [
    'br', 'ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 
    'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 
    'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to'
];

// Gerador de URL Oficial do TSE por UF
function getTseUrl(uf) {
    const ufLower = uf.toLowerCase();
    return `https://resultados.tse.jus.br/oficial/ele2026/545/dados-simplificados/${ufLower}/${ufLower}-c0001-e000545-r.json`;
}

// Controladores de estado e resiliência
let falhasConsecutivas = 0;
const LIMITE_ALERTA_FALHAS = 3;

// Estrutura de Cache em Memória por UF
const cacheDadosUF = {};
const historicoGraficoUF = {};

// Inicializa a estrutura de cache para todas as UFs válidas
UFS_VALIDAS.forEach(uf => {
    cacheDadosUF[uf] = {
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

    historicoGraficoUF[uf] = {
        labels: [],
        lula: [],
        flavio: []
    };
});

// Função auxiliar para normalizar texto
function normalizarTexto(txt) {
    return (txt || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Função genérica para buscar e atualizar dados no TSE para uma determinada UF
async function atualizarDadosUF(uf) {
    try {
        const url = getTseUrl(uf);
        const response = await axios.get(url, { timeout: 3000 });
        
        if (response.data) {
            if (uf === 'br') falhasConsecutivas = 0; // Reseta falhas se a chamada principal (BR) funcionar
            const data = response.data;
            
            cacheDadosUF[uf] = {
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

            let pctLula = 0;
            let pctFlavio = 0;

            cacheDadosUF[uf].cand.forEach(c => {
                let nomeNorm = normalizarTexto(c.nm);
                let numCand = c.n || '';
                if (numCand === '13' || nomeNorm.includes('lula')) {
                    pctLula = parseFloat((c.pvap || "0").replace(',', '.'));
                } else if (numCand === '22' || nomeNorm.includes('flavio') || nomeNorm.includes('bolsonaro')) {
                    pctFlavio = parseFloat((c.pvap || "0").replace(',', '.'));
                }
            });

            const horaAtual = cacheDadosUF[uf].hg;
            const pctApurado = parseFloat((cacheDadosUF[uf].pst || "0").replace(',', '.'));

            if (pctApurado > 0 && !historicoGraficoUF[uf].labels.includes(horaAtual)) {
                if (historicoGraficoUF[uf].labels.length >= 200) {
                    historicoGraficoUF[uf].labels.shift();
                    historicoGraficoUF[uf].lula.shift();
                    historicoGraficoUF[uf].flavio.shift();
                }
                historicoGraficoUF[uf].labels.push(horaAtual);
                historicoGraficoUF[uf].lula.push(pctLula);
                historicoGraficoUF[uf].flavio.push(pctFlavio);
            }
        }
    } catch (error) {
        if (uf === 'br') {
            falhasConsecutivas++;
            console.warn(`[AVISO TSE - BR] Falha ao ligar ao TSE (Tentativa ${falhasConsecutivas}). Mantendo dados em cache.`);

            if (falhasConsecutivas >= LIMITE_ALERTA_FALHAS) {
                console.error(`[ALERTA CRÍTICO] O feed oficial do TSE falhou ${falhasConsecutivas} vezes seguidas.`);
            }
        }
    }
}

// Atualização recorrente do Brasil (principal) a cada 3 segundos
setInterval(() => {
    atualizarDadosUF('br');
}, 3000);

// Endpoint de Health Check
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'online',
        ultimaAtualizacaoTSE: cacheDadosUF['br'].hg,
        falhasConsecutivasTSE: falhasConsecutivas,
        servidorAtivoDesde: new Date().toISOString()
    });
});

// Endpoint para consulta de histórico específico por UF
app.get('/api/tse/historico/:uf?', (req, res) => {
    const uf = (req.params.uf || 'br').toLowerCase();
    if (!UFS_VALIDAS.includes(uf)) {
        return res.status(400).json({ error: "UF inválida." });
    }
    res.json(historicoGraficoUF[uf]);
});

// Endpoint dinâmico que atende 'br' e qualquer UF
app.get('/api/tse/:uf', async (req, res) => {
    const uf = req.params.uf.toLowerCase();

    if (uf === 'historico') {
        return res.json(historicoGraficoUF['br']);
    }

    if (!UFS_VALIDAS.includes(uf)) {
        return res.status(400).json({ error: "UF informada é inválida." });
    }

    // Se a requisição for para um estado e os dados ainda não foram atualizados nos últimos segundos, atualiza sob demanda
    if (uf !== 'br') {
        await atualizarDadosUF(uf);
    }

    res.json(cacheDadosUF[uf]);
});

app.listen(PORT, () => {
    console.log(`[SERVER PRODUÇÃO] Servidor ativo em http://localhost:${PORT}`);
});

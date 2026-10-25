const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Estado e Cache dos Dados da Eleição
let cacheEleicao = {
    nacional: null,
    estados: {},
    ultimaAtualizacao: null
};

let falhasConsecutivas = 0;
const LIMITE_ALERTA_FALHAS = 3;

// Lista de UFs do Brasil
const UFS = [
    'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN',
    'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO', 'ZZ'
];

/**
 * Gerador de URL Oficial do TSE por UF (2º Turno 2026 - Código 6258)
 */
function getTseUrl(uf) {
    const ufLower = uf.toLowerCase();
    // Estrutura padrão da API simplificada: código de eleição com 6 dígitos (e006258)
    return `https://resultados.tse.jus.br/oficial/ele2026/6258/dados-simplificados/${ufLower}/${ufLower}-c0001-e006258-r.json`;
}

/**
 * Função utilitária para fazer requisições ao TSE com User-Agent
 */
async function fetchTseData(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
        }
    });

    if (!response.ok) {
        // Tenta fallback com 3 zeros se a URL padrão com 2 zeros falhar
        if (response.status === 404 && url.includes('e006258')) {
            const urlFallback = url.replace('e006258', 'e0006258');
            const resFallback = await fetch(urlFallback, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            });
            if (resFallback.ok) {
                return await resFallback.json();
            }
        }
        throw new Error(`Erro HTTP TSE: ${response.status}`);
    }

    return await response.json();
}

/**
 * Polling Nacional (Executado a cada 3 segundos)
 */
async function pollNacional() {
    try {
        const urlBR = getTseUrl('br');
        const dataBR = await fetchTseData(urlBR);

        cacheEleicao.nacional = dataBR;
        cacheEleicao.ultimaAtualizacao = new Date().toISOString();
        
        if (falhasConsecutivas > 0) {
            console.log(' [SUCESSO TSE] Conexão reestabelecida com o feed oficial!');
            falhasConsecutivas = 0;
        }
    } catch (err) {
        falhasConsecutivas++;
        console.warn(`[AVISO TSE - BR] Falha ao ligar ao TSE (Tentativa ${falhasConsecutivas}). Mantendo dados em cache.`);
        if (falhasConsecutivas >= LIMITE_ALERTA_FALHAS) {
            console.error(`[ALERTA CRÍTICO] O feed oficial do TSE falhou ${falhasConsecutivas} vezes seguidas.`);
        }
    }
}

/**
 * Polling dos Estados (Executado de forma escalonada a cada 15 segundos)
 */
async function pollEstados() {
    for (const uf of UFS) {
        try {
            const urlUF = getTseUrl(uf);
            const dataUF = await fetchTseData(urlUF);
            cacheEleicao.estados[uf] = dataUF;
            
            // Intervalo de 200ms entre estados para evitar bloqueios de taxa (rate limiting)
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (err) {
            // Falha silenciosa para manter dados anteriores da UF em cache
        }
    }
}

// Iniciar Loops de Polling
setInterval(pollNacional, 3000);   // Cada 3 segundos para o Brasil
setInterval(pollEstados, 15000);   // Cada 15 segundos para os Estados

// Primeira execução imediata ao iniciar o servidor
pollNacional();
pollEstados();

// --- ROTAS DA API INTERNA ---

app.get('/api/dados', (req, res) => {
    res.json({
        nacional: cacheEleicao.nacional,
        estados: cacheEleicao.estados,
        ultimaAtualizacao: cacheEleicao.ultimaAtualizacao,
        statusFeed: falhasConsecutivas < LIMITE_ALERTA_FALHAS ? 'ONLINE' : 'OFFLINE'
    });
});

app.get('/api/dados/:uf', (req, res) => {
    const ufParam = req.params.uf.toUpperCase();
    
    if (ufParam === 'BR') {
        return res.json(cacheEleicao.nacional || { error: 'Dados nacionais ainda não carregados' });
    }

    if (cacheEleicao.estados[ufParam]) {
        return res.json(cacheEleicao.estados[ufParam]);
    }

    return res.status(404).json({ error: `Dados para a UF ${ufParam} ainda não disponíveis em cache` });
});

// Rota genérica para servir a SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(` Servidor de Apuração Ativo na porta ${PORT}`);
});

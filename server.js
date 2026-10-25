const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Servir ficheiros estáticos a partir da raiz do projeto (onde está o index.html)
app.use(express.static(path.join(__dirname)));

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
function getTseUrl(uf, sulfixo = 'e006258') {
    const ufLower = uf.toLowerCase();
    return `https://resultados.tse.jus.br/oficial/ele2026/6258/dados-simplificados/${ufLower}/${ufLower}-c0001-${sulfixo}-r.json`;
}

/**
 * Requisição segura via módulo nativo 'https' do Node.js
 */
function requestHttps(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            }
        }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Erro HTTP TSE: ${res.statusCode}`));
            }
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error('Erro ao converter JSON do TSE'));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.end();
    });
}

/**
 * Procura dados no TSE com fallback automático de formato de zeros (e006258 / e0006258)
 */
async function fetchTseData(uf) {
    try {
        return await requestHttps(getTseUrl(uf, 'e006258'));
    } catch (err) {
        return await requestHttps(getTseUrl(uf, 'e0006258'));
    }
}

/**
 * Polling Nacional (Executado a cada 3 segundos)
 */
async function pollNacional() {
    try {
        const dataBR = await fetchTseData('br');

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
            const dataUF = await fetchTseData(uf);
            cacheEleicao.estados[uf] = dataUF;
            await new Promise(resolve => setTimeout(resolve, 150));
        } catch (err) {
            // Mantém dados anteriores da UF em cache se a chamada falhar
        }
    }
}

// Iniciar Loops de Polling
setInterval(pollNacional, 3000);   // A cada 3 segundos para o Brasil
setInterval(pollEstados, 15000);   // A cada 15 segundos para os Estados

// Primeira execução ao iniciar o servidor
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

// Servir o index.html localizado na raiz do projeto
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(` Servidor de Apuração Ativo na porta ${PORT}`);
});

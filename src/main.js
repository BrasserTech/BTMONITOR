// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { google } = require('googleapis');

/* =========================
   Utilidades de caminho/env
   ========================= */
function firstExisting(candidates) {
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

function loadDotenv() {
  const appPath = (() => {
    try { return app.getAppPath(); } catch { return null; }
  })();

  const candidates = [
    appPath && path.join(appPath, '.env.local'),
    process.resourcesPath && path.join(process.resourcesPath, 'app', '.env.local'),
    process.resourcesPath && path.join(process.resourcesPath, '.env.local'),
    path.join(__dirname, '.env.local'),
    path.join(__dirname, '..', '.env.local'),
    path.join(process.cwd(), '.env.local'),
  ].filter(Boolean);

  const envFile = firstExisting(candidates);
  if (envFile) {
    dotenv.config({ path: envFile });
    console.log('[ENV] Carregado de:', envFile);
  } else {
    console.warn('[ENV] .env.local não encontrado. Variáveis podem estar ausentes.');
  }
  return envFile;
}

function resolveCredentialFile() {
  const appPath = (() => { try { return app.getAppPath(); } catch { return null; } })();
  const candidates = [
    appPath && path.join(appPath, 'service-account.json'),
    process.resourcesPath && path.join(process.resourcesPath, 'app', 'service-account.json'),
    process.resourcesPath && path.join(process.resourcesPath, 'service-account.json'),
    path.join(__dirname, 'service-account.json'),
    path.join(__dirname, '..', 'service-account.json'),
    path.join(process.cwd(), 'service-account.json'),
  ].filter(Boolean);

  const keyFile = firstExisting(candidates);
  if (!keyFile) throw new Error('Arquivo service-account.json não encontrado.');
  return keyFile;
}

/* =========================
   Carregar .env.local
   ========================= */
loadDotenv();

// Planilha
const SHEET_ID    = process.env.GOOGLE_SHEET_ID;
const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || 'Página2!A2:H';
const SHEET_GID   = process.env.GOOGLE_SHEET_GID || null; // opcional

// Correção de fuso (minutos). Padrão 180 = UTC-3 (Brasília).
const TZ_FIX_MIN = Number.isFinite(Number(process.env.TZ_FIX_MIN))
  ? Number(process.env.TZ_FIX_MIN)
  : 180;

/* =========================
   Helpers de tempo e domínio
   ========================= */
// Aplica correção de fuso SOMENTE quando a string possui timezone explícito (Z ou ±hh:mm)
function parseDateWithFix(iso) {
  if (!iso) return null;
  const s = String(iso);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  const hasTZ = /Z|[+-]\d{2}:\d{2}$/.test(s);
  if (hasTZ && TZ_FIX_MIN) {
    return new Date(d.getTime() + TZ_FIX_MIN * 60 * 1000);
  }
  return d;
}

function formatHoraLocalFromISO(iso) {
  const d = parseDateWithFix(iso);
  if (!d) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function mapStatus(cod) {
  const s = String(cod ?? '').trim();
  if (s === '1') return 'Em preparo';
  if (s === '2') return 'Saiu para entrega';
  if (s === '3') return 'Pronto';
  return s || '—';
}

function titleFromRange(range) {
  if (!range || !range.includes('!')) return null;
  return range.split('!')[0].replace(/^'|'+$/g, '');
}

/* =========================
   Google Sheets (leitura/escrita)
   ========================= */
async function getSheetsClient() {
  const keyFilePath = resolveCredentialFile();
  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function resolveSheetTitleByGid(sheets, spreadsheetId, gid) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = (meta.data.sheets || []).find(
    s => String(s.properties?.sheetId) === String(gid)
  );
  if (!sheet) throw new Error(`Aba com GID ${gid} não encontrada.`);
  return sheet.properties.title;
}

async function fetchFromSheet() {
  if (!SHEET_ID) throw new Error('Falta GOOGLE_SHEET_ID no .env.local');

  const sheets = await getSheetsClient();

  let range = SHEET_RANGE;
  let title = titleFromRange(range);

  if (!title && SHEET_GID) {
    title = await resolveSheetTitleByGid(sheets, SHEET_ID, SHEET_GID);
    range = `${title}!A2:H`;
  } else if (!title) {
    title = 'Página2';
    range = `${title}!A2:H`;
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  // Colunas: A Data/Hora | B Cliente | C Pedido | D Observações | E Valor total | F Status | G Endereço | H Contato
  return rows.map((r, i) => {
    const [dataHora, nome, pedido, obs, valorTotal, statusCod, endereco, contato] = r;

    // Ajuste de fuso: gera um Date corrigido (quando necessário)
    const dAdj = parseDateWithFix(dataHora);
    const horaStr = dAdj ? dAdj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
    const horaRawISO = dAdj ? dAdj.toISOString() : null; // usado no filtro no renderer

    return {
      rowNumber: i + 2,              // A2 => linha 2
      hora: horaStr,                 // exibição
      horaRaw: horaRawISO,           // base para filtros "hoje" no renderer
      cliente: nome || '—',
      item: (pedido && String(pedido).trim()) ? pedido : '—',
      qtd: 1,
      status: mapStatus(statusCod),
      statusCode: String(statusCod ?? '').trim() || '',
      local: endereco || '—',
      observacao: (obs && String(obs).trim()) ? obs : '—',
      contato: contato || '—',
      valor: valorTotal || null,
      sheetTitle: title,
    };
  });
}

async function updateStatus(rowNumber, newStatusCode, sheetTitleArg) {
  if (!SHEET_ID) throw new Error('Falta GOOGLE_SHEET_ID no .env.local');

  const sheets = await getSheetsClient();

  let title = sheetTitleArg || titleFromRange(SHEET_RANGE);
  if (!title && SHEET_GID) title = await resolveSheetTitleByGid(sheets, SHEET_ID, SHEET_GID);
  if (!title) title = 'Página2';

  const range = `${title}!F${rowNumber}:F${rowNumber}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[String(newStatusCode)]] },
  });

  return { ok: true };
}

/* =========================
   Electron (janela / lifecycle)
   ========================= */
function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  const indexPath = path.join(__dirname, 'index.html');

  const win = new BrowserWindow({
    width: 1200,
    height: 740,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  win.loadFile(indexPath);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

/* =========================
   IPC
   ========================= */
ipcMain.handle('pedidos:listar', async () => {
  try {
    const data = await fetchFromSheet();
    return { ok: true, data };
  } catch (err) {
    console.error('[Sheets] Erro leitura:', err);
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('pedidos:updateStatus', async (_evt, rowNumber, newStatusCode, sheetTitle) => {
  try {
    if (!rowNumber || !newStatusCode) throw new Error('Parâmetros inválidos para atualização de status.');
    await updateStatus(rowNumber, newStatusCode, sheetTitle);
    return { ok: true };
  } catch (err) {
    console.error('[Sheets] Erro escrita:', err);
    return { ok: false, error: String(err?.message || err) };
  }
});

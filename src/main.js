const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

// ======== .env.local (apenas ID e RANGE) ========
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}
const SHEET_ID    = process.env.GOOGLE_SHEET_ID;
const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || 'Página2!A2:H';
const SHEET_GID   = process.env.GOOGLE_SHEET_GID || null; // opcional

// ======== Utilidades ========
function mapStatus(cod) {
  const s = String(cod ?? '').trim();
  if (s === '1') return 'Em preparo';
  if (s === '2') return 'Saiu para entrega';
  if (s === '3') return 'Pronto';
  return s || '—';
}
function horaLocal(iso) {
  const d = new Date(iso);
  if (!isNaN(d)) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return '—';
}
function titleFromRange(range) {
  if (!range || !range.includes('!')) return null;
  return range.split('!')[0].replace(/^'|'+$/g, '');
}

// ======== Autenticação via ARQUIVO JSON (com escrita) ========
async function getSheetsClient() {
  const candidates = [
    path.join(__dirname, '..', 'service-account.json'),                // dev
    path.join(process.resourcesPath || '', 'service-account.json'),    // pacote
  ];
  const keyFilePath = candidates.find(p => p && fs.existsSync(p));
  if (!keyFilePath) throw new Error('Arquivo service-account.json não encontrado.');
  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'], // leitura + escrita
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

// ======== Leitura ========
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

  // A..H: A Data/Hora | B Cliente | C Pedido | D Observações | E Valor total | F Status | G Endereço | H Contato
  return rows.map((r, i) => {
    const [dataHora, nome, pedido, obs, valorTotal, statusCod, endereco, contato] = r;
    return {
      rowNumber: i + 2,
      hora: horaLocal(dataHora),
      horaRaw: dataHora || null,
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

// ======== Escrita (atualizar status F{row}) ========
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

// ======== Electron ========
function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
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
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ======== IPC ========
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

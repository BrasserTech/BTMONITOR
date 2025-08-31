const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

// Carrega .env.local (apenas ID/RANGE da planilha)
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const SHEET_ID    = process.env.GOOGLE_SHEET_ID;
const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || 'Página2!A2:H';
const SHEET_GID   = process.env.GOOGLE_SHEET_GID || null;

// ---------------- Utilidades ----------------
function mapStatus(v) {
  const s = String(v ?? '').trim();
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

// ---------------- Google Sheets (JSON) ----------------
async function getSheetsClient() {
  const tryPaths = [
    path.join(__dirname, '..', 'service-account.json'),       // dev
    path.join(process.resourcesPath || '', 'service-account.json'), // pacote
  ];
  const keyFilePath = tryPaths.find(p => p && fs.existsSync(p));
  if (!keyFilePath) throw new Error('service-account.json não encontrado');
  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
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

  // Precedência: RANGE explícito > (GID -> título + A2:H) > padrão
  let range = SHEET_RANGE;
  if ((!range || !range.includes('!')) && SHEET_GID) {
    const title = await resolveSheetTitleByGid(sheets, SHEET_ID, SHEET_GID);
    range = `${title}!A2:H`;
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  // A..H: A Data/Hora | B Cliente | C Pedido | D Observações | E Valor total | F Status | G Endereço | H Contato
  return rows.map(r => {
    const [dataHora, nome, pedido, obs, valorTotal, status, endereco, contato] = r;
    return {
      hora: horaLocal(dataHora),
      horaRaw: dataHora || null,
      cliente: nome || '—',
      item: pedido || '—',
      // Se E for valor monetário, mantemos qtd simbólica = 1
      qtd: 1,
      status: mapStatus(status),
      local: endereco || '—',
      observacao: (obs && obs.trim()) ? obs : '—',
      contato: contato || '—',
      valor: valorTotal || null,
    };
  });
}

// ---------------- Janela Electron ----------------
function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[main] preload:', preloadPath);

  const win = new BrowserWindow({
    width: 1100,
    height: 700,
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

// ---------------- IPC ----------------
ipcMain.handle('pedidos:listar', async () => {
  try {
    const data = await fetchFromSheet();
    return { ok: true, data };
  } catch (err) {
    console.error('[Sheets] Erro:', err);
    return { ok: false, error: String(err?.message || err) };
  }
});

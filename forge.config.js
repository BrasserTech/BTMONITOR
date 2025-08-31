// forge.config.js
const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.join(__dirname, 'assets', 'icon'), // Windows usa .ico; não coloque a extensão aqui
    // Inclua explicitamente os arquivos que você precisa em runtime
    // (por padrão já entram; isto aqui é só para garantir)
    // ignore: [/^\/out($|\/)/], // opcional
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'BTMonitor',
        setupIcon: path.join(__dirname, 'assets', 'icon.ico'),
        // iconUrl é opcional; para updates via Squirrel remotos é exigido.
      },
    },
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'linux'] },
  ],
};

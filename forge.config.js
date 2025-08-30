module.exports = {
  packagerConfig: {},
  rebuildConfig: {},
  makers: [
    { name: '@electron-forge/maker-squirrel' },
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
  ],
};

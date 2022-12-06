const { BlockFrostCardano } = require('../lib/index');

const instance = new BlockFrostCardano({
  mnemonic:
    'behave laugh search gospel whisper dose acid wash accident husband rival dog post hover bulb',
  language: 'english',
  blockfrostProjectId: 'previewOWU32tDdWQbIS7HQNgMYsKGxzofAyyHV',
  testnet: true,
  byron: true
});

console.log(instance.generateAddress()); // 2cWKMJemoBajs2dnHVXmLiMBr6XRd9Ar5pFVdxDS1bPqomGy1RoUQALyVJZSsbpU6itPL

const { BlockFrostCardano } = require('../lib/index');

const instance = new BlockFrostCardano({
  mnemonic:
    'behave laugh search gospel whisper dose acid wash accident husband rival dog post hover bulb',
  language: 'english',
  blockfrostProjectId: 'previewOWU32tDdWQbIS7HQNgMYsKGxzofAyyHV',
  testnet: true,
});

console.log(instance.generateAddress()); 
// addr_test1qq7vannmxkp707dhuwejc0uv4uj7nz8dz2s9j9f92xrkkuwf9rh4fmj0t9wqplc5ku6qtdd3pem3tp3vla79mdwha3lq7y50zz

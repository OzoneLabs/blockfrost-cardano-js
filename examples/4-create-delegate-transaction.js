const { BlockFrostCardano } = require('../lib/index');

const instance = new BlockFrostCardano({
  mnemonic:
    'behave laugh search gospel whisper dose acid wash accident husband rival dog post hover bulb',
  language: 'english',
  blockfrostProjectId: 'previewOWU32tDdWQbIS7HQNgMYsKGxzofAyyHV',
  testnet: true,
});

instance
  .createDelegateTx(
    'addr_test1qq7vannmxkp707dhuwejc0uv4uj7nz8dz2s9j9f92xrkkuwf9rh4fmj0t9wqplc5ku6qtdd3pem3tp3vla79mdwha3lq7y50zz',
    'efae72c07a26e4542ba55ef59d35ad45ffaaac312865e3a758ede997'
  )
  .then(console.log);

  // {
  //   tx_hash: '84a400818258203400d7cc719c57ab04a6aabf499070db1b3d9c67075a813089fd99121b6f97c200018282583900601969c751ebd475623e37ddd05e7188531222cd3af2d95e01887205c928ef54ee4f595c00ff14b73405b5b10e7715862cff7c5db5d7ec7e1a000f4240825839003ccece7b3583e7f9b7e3b32c3f8caf25e988ed12a059152551876b71c928ef54ee4f595c00ff14b73405b5b10e7715862cff7c5db5d7ec7e1b0000000253fa0f93021a0002922d031a0037e206a100818258208fc863ceccdb6f7684b58d740ff0e59092aebd938dee3273ec81dd1bdaef8cae58407dfa85198642f60054b74453c51b694471348ef4f45f07b46a6e5c7d4e5103057b52a01f87a901d20a87e1b5d6ee4ea06fbd07e0f08680deccaa4ad3614dd603f5f6',
  //   fee: '168493'
  // }
import * as bip39 from 'bip39';
import * as Cardano from '@emurgo/cardano-serialization-lib-nodejs';
import bigNumber from 'bignumber.js';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';

const CARDANO_PARAMS = {
  COINS_PER_UTXO_WORD: '34482',
  MAX_TX_SIZE: 16384,
  MAX_VALUE_SIZE: 5000,
};
const MIN_BALANCE = 1000000;
const COMMON_FEE = 200000;

function harden(num: number) {
  return 0x80000000 + num;
}

export interface BlockFrostCardanoOptions {
  mnemonic?: string;
  privateKey?: string;
  network?: string;
  language?: WordList;
  byron?: boolean;
  testnet?: boolean;
  blockfrostProjectId?: string;
  blockfrostClient?: BlockFrostAPI;
}

export enum Chain {
  EXTERNAL,
  INTERNAL,
}

export enum WordList {
  czech = 'czech',
  chinese_simplified = 'chinese_simplified',
  chinese_traditional = 'chinese_traditional',
  korean = 'korean',
  french = 'french',
  italian = 'italian',
  spanish = 'spanish',
  japanese = 'japanese',
  portuguese = 'portuguese',
  english = 'english',
}

export interface Address {
  address: string;
  chain: number;
  index: number;
  spendKey: Cardano.Bip32PrivateKey;
}

export interface TransactionOutput {
  tx_hash: string;
  fee: string;
}
export class BlockFrostCardano {
  rootKey: Cardano.Bip32PrivateKey;
  stakeKey: Cardano.Bip32PrivateKey;
  byron: boolean;
  network: Cardano.NetworkInfo;
  addresses: Map<string, Address>;
  blockfrost: BlockFrostAPI;

  constructor(opts: BlockFrostCardanoOptions) {
    if (opts && opts.blockfrostProjectId) {
      this.blockfrost = new BlockFrostAPI({
        projectId: opts.blockfrostProjectId,
        network: opts.testnet ? 'preview' : 'mainnet',
      });
    } else if (opts && opts.blockfrostClient) {
      this.blockfrost = opts.blockfrostClient;
    } else {
      throw new Error('Either mnemonic or privateKey must be provided');
    }

    if (opts && opts.mnemonic) {
      const language = opts.language || WordList.english;
      this.rootKey = this.rootKeyFromMnemonic(opts.mnemonic, language);
    } else if (opts && opts.privateKey) {
      this.rootKey = this.rootKeyFromPrivateKey(opts.privateKey);
    } else {
      throw new Error('Either mnemonic or privateKey must be provided');
    }
    this.byron = opts.byron || false;
    this.network = opts.testnet
      ? Cardano.NetworkInfo.testnet()
      : Cardano.NetworkInfo.mainnet();

    this.stakeKey = this.createStakeKey();
    this.addresses = this.createAddresses();
  }

  public static generateMnemonic(length = 12, language = WordList.english) {
    const mnemonic = bip39.generateMnemonic(
      (length / 3) * 32,
      undefined,
      bip39.wordlists[language]
    );

    return mnemonic;
  }

  private rootKeyFromMnemonic(
    mnemonic: string,
    language: WordList
  ): Cardano.Bip32PrivateKey {
    const entropy = bip39.mnemonicToEntropy(
      mnemonic,
      bip39.wordlists[language]
    );
    const rootKey = Cardano.Bip32PrivateKey.from_bip39_entropy(
      Buffer.from(entropy, 'hex'),
      Buffer.from('', 'hex')
    );
    return rootKey;
  }

  private rootKeyFromPrivateKey(privateKey: string): Cardano.Bip32PrivateKey {
    return Cardano.Bip32PrivateKey.from_bytes(Buffer.from(privateKey, 'hex'));
  }

  private createStakeKey() {
    const stakeKey = this.rootKey
      .derive(harden(1852))
      .derive(harden(1815))
      .derive(harden(0))
      .derive(2)
      .derive(0);
    return stakeKey;
  }

  private createSpendKey(chain: Chain, idx: number) {
    const spendKey = this.rootKey
      .derive(harden(this.byron ? 44 : 1852))
      .derive(harden(1815))
      .derive(harden(0))
      .derive(chain)
      .derive(idx);

    return spendKey;
  }

  private createByronAddress(spendKey: Cardano.Bip32PrivateKey) {
    const byronAddr = Cardano.ByronAddress.icarus_from_key(
      spendKey.to_public(),
      this.network.protocol_magic()
    );
    return byronAddr.to_base58();
  }

  private createShellyAddress(spendKey: Cardano.Bip32PrivateKey) {
    const spendCred = Cardano.StakeCredential.from_keyhash(
      spendKey.to_public().to_raw_key().hash()
    );
    const stakeCred = Cardano.StakeCredential.from_keyhash(
      this.stakeKey.to_public().to_raw_key().hash()
    );
    const addrNet0 = Cardano.BaseAddress.new(
      this.network.network_id(),
      spendCred,
      stakeCred
    ).to_address();

    return addrNet0.to_bech32();
  }

  private createAddresses() {
    const addresses = new Map();
    for (let chain = 0; chain <= 1; chain++) {
      for (let index = 0; index < 100; index++) {
        const spendKey = this.createSpendKey(chain, index);
        const address = this.byron
          ? this.createByronAddress(spendKey)
          : this.createShellyAddress(spendKey);
        addresses.set(address, {
          address,
          chain,
          index,
          spendKey,
        });
      }
    }
    return addresses;
  }

  public generateAddress(idx = 0) {
    if (idx > 20)
      throw new Error('You cannot generate more than 20 addresses.');
    const spendKey = this.createSpendKey(0, idx);
    const address = this.byron
      ? this.createByronAddress(spendKey)
      : this.createShellyAddress(spendKey);

    return address;
  }

  public getStakeAddress() {
    const rewardAddr = Cardano.RewardAddress.new(
      this.network.network_id(),
      Cardano.StakeCredential.from_keyhash(
        this.stakeKey.to_public().to_raw_key().hash()
      )
    );
    return rewardAddr.to_address().to_bech32();
  }

  public async createTransferTx(
    fromAddress: string,
    outputAddress: string,
    outputAmount: string
  ): Promise<TransactionOutput> {
    const amount = new bigNumber(outputAmount).multipliedBy(1000000);

    const isByronAddress = Cardano.ByronAddress.is_valid(outputAddress);

    const { address, spendKey } = this.addresses.get(fromAddress) as Address;

    if (!address) throw new Error('This address not belong to this wallet');

    const latestBlock = await this.blockfrost.blocksLatest();

    const currentSlot = latestBlock.slot || 0;

    const inputs = await this.blockfrost.addressesUtxos(fromAddress);

    if (!inputs || !inputs.length)
      throw new Error(
        `You should send ADA to ${address} to have enough funds to sent a transaction`
      );

    const txBuilder = Cardano.TransactionBuilder.new(
      Cardano.TransactionBuilderConfigBuilder.new()
        .fee_algo(
          Cardano.LinearFee.new(
            Cardano.BigNum.from_str('44'),
            Cardano.BigNum.from_str('155381')
          )
        )
        .pool_deposit(Cardano.BigNum.from_str('500000000'))
        .key_deposit(Cardano.BigNum.from_str('2000000'))
        .coins_per_utxo_word(
          Cardano.BigNum.from_str(CARDANO_PARAMS.COINS_PER_UTXO_WORD)
        )
        .max_value_size(CARDANO_PARAMS.MAX_VALUE_SIZE)
        .max_tx_size(CARDANO_PARAMS.MAX_TX_SIZE)
        .build()
    );

    const outputAddr = isByronAddress
      ? Cardano.ByronAddress.from_base58(outputAddress).to_address()
      : Cardano.Address.from_bech32(outputAddress);

    const changeAddr = this.byron
      ? Cardano.ByronAddress.from_base58(address).to_address()
      : Cardano.Address.from_bech32(address);

    const ttl = currentSlot + 7200;
    txBuilder.set_ttl(ttl);

    txBuilder.add_output(
      Cardano.TransactionOutput.new(
        outputAddr,
        Cardano.Value.new(Cardano.BigNum.from_str(amount.toString()))
      )
    );

    const lovelaceUtxos = inputs.filter(
      (u) => !u.amount.find((a) => a.unit !== 'lovelace')
    );

    const unspentOutputs = Cardano.TransactionUnspentOutputs.new();
    for (const utxo of lovelaceUtxos) {
      const amount = utxo.amount.find((a) => a.unit === 'lovelace')?.quantity;

      if (!amount) continue;

      const inputValue = Cardano.Value.new(
        Cardano.BigNum.from_str(amount.toString())
      );

      const input = Cardano.TransactionInput.new(
        Cardano.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')),
        utxo.output_index
      );
      const output = Cardano.TransactionOutput.new(changeAddr, inputValue);
      unspentOutputs.add(Cardano.TransactionUnspentOutput.new(input, output));
    }

    txBuilder.add_inputs_from(
      unspentOutputs,
      Cardano.CoinSelectionStrategyCIP2.LargestFirst
    );

    txBuilder.add_change_if_needed(changeAddr);

    const txBody = txBuilder.build();

    const txHash = Cardano.hash_transaction(txBody);

    const witnesses = Cardano.TransactionWitnessSet.new();

    if (this.byron) {
      const byronAddr = Cardano.ByronAddress.from_base58(address);

      const bootstrapWitnesses = Cardano.BootstrapWitnesses.new();

      const bootstrapWitness = Cardano.make_icarus_bootstrap_witness(
        txHash,
        byronAddr,
        spendKey
      );

      bootstrapWitnesses.add(bootstrapWitness);

      witnesses.set_bootstraps(bootstrapWitnesses);
    } else {
      const vkeyWitnesses = Cardano.Vkeywitnesses.new();

      vkeyWitnesses.add(
        Cardano.make_vkey_witness(txHash, spendKey.to_raw_key())
      );

      witnesses.set_vkeys(vkeyWitnesses);
    }

    const tx = Cardano.Transaction.new(txBody, witnesses);

    const tx_hash = tx.to_hex();

    const fee = txBuilder.get_fee_if_set()?.to_str() || '0';

    return { tx_hash, fee };
  }

  async createDelegateTx(fromAddress: string, poolId: string) {
    const { address, spendKey } = this.addresses.get(fromAddress) as Address;

    const changeAddr = Cardano.Address.from_bech32(address);

    const latestBlock = await this.blockfrost.blocksLatest();
    const ttl = latestBlock.slot || 0;
    const { active } = await this.blockfrost.accounts(this.getStakeAddress());
    const isFirstStake = !active;

    const inputs = await this.blockfrost.addressesUtxos(address);

    const stakeCred = Cardano.StakeCredential.from_keyhash(
      this.stakeKey.to_public().to_raw_key().hash()
    );

    const txBuilder = Cardano.TransactionBuilder.new(
      Cardano.TransactionBuilderConfigBuilder.new()
        .fee_algo(
          Cardano.LinearFee.new(
            Cardano.BigNum.from_str('44'),
            Cardano.BigNum.from_str('155381')
          )
        )
        .pool_deposit(Cardano.BigNum.from_str('500000000'))
        .key_deposit(Cardano.BigNum.from_str('2000000'))
        .coins_per_utxo_word(
          Cardano.BigNum.from_str(CARDANO_PARAMS.COINS_PER_UTXO_WORD)
        )
        .max_value_size(CARDANO_PARAMS.MAX_VALUE_SIZE)
        .max_tx_size(CARDANO_PARAMS.MAX_TX_SIZE)
        .build()
    );

    const lovelaceUtxos = inputs.filter(
      (u) => !u.amount.find((a) => a.unit !== 'lovelace')
    );

    const unspentOutputs = Cardano.TransactionUnspentOutputs.new();
    for (const utxo of lovelaceUtxos) {
      const amount = utxo.amount.find((a) => a.unit === 'lovelace')?.quantity;

      if (!amount) continue;

      const inputValue = Cardano.Value.new(
        Cardano.BigNum.from_str(amount.toString())
      );

      const input = Cardano.TransactionInput.new(
        Cardano.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')),
        utxo.output_index
      );
      const output = Cardano.TransactionOutput.new(changeAddr, inputValue);

      unspentOutputs.add(Cardano.TransactionUnspentOutput.new(input, output));
    }

    txBuilder.add_inputs_from(
      unspentOutputs,
      Cardano.CoinSelectionStrategyCIP2.LargestFirst
    );

    txBuilder.set_ttl(ttl + 7200);

    const poolKeyHash = Cardano.Ed25519KeyHash.from_bytes(
      Buffer.from(poolId, 'hex')
    );
    const certs = Cardano.Certificates.new();

    if (isFirstStake == true) {
      certs.add(
        Cardano.Certificate.new_stake_registration(
          Cardano.StakeRegistration.new(stakeCred)
        )
      );
    }

    certs.add(
      Cardano.Certificate.new_stake_delegation(
        Cardano.StakeDelegation.new(stakeCred, poolKeyHash)
      )
    );

    txBuilder.set_certs(certs);

    txBuilder.add_change_if_needed(changeAddr);

    const txBody = txBuilder.build();

    const txHash = Cardano.hash_transaction(txBody);

    const witnesses = Cardano.TransactionWitnessSet.new();
    {
      const vkeyWitnesses = Cardano.Vkeywitnesses.new();

      vkeyWitnesses.add(
        Cardano.make_vkey_witness(txHash, spendKey.to_raw_key())
      );

      vkeyWitnesses.add(
        Cardano.make_vkey_witness(txHash, this.stakeKey.to_raw_key())
      );

      witnesses.set_vkeys(vkeyWitnesses);
    }

    const tx = Cardano.Transaction.new(txBody, witnesses);

    const tx_hash = tx.to_hex();

    const fee = txBuilder.get_fee_if_set()?.to_str() || '0';

    return { tx_hash, fee };
  }

  async createUnDelegateTx(fromAddress: string) {
    const { address, spendKey } = this.addresses.get(fromAddress) as Address;

    const changeAddr = Cardano.Address.from_bech32(address);

    const latestBlock = await this.blockfrost.blocksLatest();
    const ttl = latestBlock.slot || 0;

    const inputs = await this.blockfrost.addressesUtxos(address);

    const stakeCred = Cardano.StakeCredential.from_keyhash(
      this.stakeKey.to_public().to_raw_key().hash()
    );

    const txBuilder = Cardano.TransactionBuilder.new(
      Cardano.TransactionBuilderConfigBuilder.new()
        .fee_algo(
          Cardano.LinearFee.new(
            Cardano.BigNum.from_str('44'),
            Cardano.BigNum.from_str('155381')
          )
        )
        .pool_deposit(Cardano.BigNum.from_str('500000000'))
        .key_deposit(Cardano.BigNum.from_str('2000000'))
        .coins_per_utxo_word(
          Cardano.BigNum.from_str(CARDANO_PARAMS.COINS_PER_UTXO_WORD)
        )
        .max_value_size(CARDANO_PARAMS.MAX_VALUE_SIZE)
        .max_tx_size(CARDANO_PARAMS.MAX_TX_SIZE)
        .build()
    );

    let sumInputs = bigNumber(0);
    const lovelaceUtxos = inputs.filter(
      (u) => !u.amount.find((a) => a.unit !== 'lovelace')
    );

    const unspentOutputs = Cardano.TransactionUnspentOutputs.new();
    for (const utxo of lovelaceUtxos) {
      const amount = utxo.amount.find((a) => a.unit === 'lovelace')?.quantity;

      if (!amount) continue;
      sumInputs = sumInputs.plus(amount);
      const inputValue = Cardano.Value.new(
        Cardano.BigNum.from_str(amount.toString())
      );

      const input = Cardano.TransactionInput.new(
        Cardano.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')),
        utxo.output_index
      );
      const output = Cardano.TransactionOutput.new(changeAddr, inputValue);

      unspentOutputs.add(Cardano.TransactionUnspentOutput.new(input, output));
    }

    txBuilder.add_inputs_from(
      unspentOutputs,
      Cardano.CoinSelectionStrategyCIP2.LargestFirst
    );
    sumInputs = sumInputs.plus(2000000); // Refund STAKE
    txBuilder.set_ttl(ttl + 7200);

    const certs = Cardano.Certificates.new();

    certs.add(
      Cardano.Certificate.new_stake_deregistration(
        Cardano.StakeDeregistration.new(stakeCred)
      )
    );

    txBuilder.set_certs(certs);

    txBuilder.add_change_if_needed(changeAddr);

    const txBody = txBuilder.build();

    const txHash = Cardano.hash_transaction(txBody);

    const witnesses = Cardano.TransactionWitnessSet.new();
    {
      const vkeyWitnesses = Cardano.Vkeywitnesses.new();

      vkeyWitnesses.add(
        Cardano.make_vkey_witness(txHash, spendKey.to_raw_key())
      );

      vkeyWitnesses.add(
        Cardano.make_vkey_witness(txHash, this.stakeKey.to_raw_key())
      );

      witnesses.set_vkeys(vkeyWitnesses);
    }

    const tx = Cardano.Transaction.new(txBody, witnesses);

    const tx_hash = tx.to_hex();

    const fee = txBuilder.get_fee_if_set()?.to_str() || '0';

    return { tx_hash, fee };
  }

  async createClaimRewardTx(fromAddress: string, rewardAmount: string) {
    const { address, spendKey } = this.addresses.get(fromAddress) as Address;
    const account = await this.blockfrost.accounts(this.getStakeAddress());
    const amount = new bigNumber(rewardAmount).multipliedBy(1000000);
    if (amount.plus(account.controlled_amount).lt(MIN_BALANCE + COMMON_FEE)) {
      throw new Error("You don't have enough balance to pay transaction fee.");
    }

    const changeAddr = Cardano.Address.from_bech32(address);

    const latestBlock = await this.blockfrost.blocksLatest();
    const ttl = latestBlock.slot || 0;

    const inputs = await this.blockfrost.addressesUtxos(address);

    const stakeCred = Cardano.StakeCredential.from_keyhash(
      this.stakeKey.to_public().to_raw_key().hash()
    );

    const txBuilder = Cardano.TransactionBuilder.new(
      Cardano.TransactionBuilderConfigBuilder.new()
        .fee_algo(
          Cardano.LinearFee.new(
            Cardano.BigNum.from_str('44'),
            Cardano.BigNum.from_str('155381')
          )
        )
        .pool_deposit(Cardano.BigNum.from_str('500000000'))
        .key_deposit(Cardano.BigNum.from_str('2000000'))
        .coins_per_utxo_word(
          Cardano.BigNum.from_str(CARDANO_PARAMS.COINS_PER_UTXO_WORD)
        )
        .max_value_size(CARDANO_PARAMS.MAX_VALUE_SIZE)
        .max_tx_size(CARDANO_PARAMS.MAX_TX_SIZE)
        .build()
    );

    let sumInputs = bigNumber(0);
    const lovelaceUtxos = inputs.filter(
      (u) => !u.amount.find((a) => a.unit !== 'lovelace')
    );

    const unspentOutputs = Cardano.TransactionUnspentOutputs.new();
    for (const utxo of lovelaceUtxos) {
      const amount = utxo.amount.find((a) => a.unit === 'lovelace')?.quantity;

      if (!amount) continue;
      sumInputs = sumInputs.plus(amount);
      const inputValue = Cardano.Value.new(
        Cardano.BigNum.from_str(amount.toString())
      );

      const input = Cardano.TransactionInput.new(
        Cardano.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')),
        utxo.output_index
      );
      const output = Cardano.TransactionOutput.new(changeAddr, inputValue);

      unspentOutputs.add(Cardano.TransactionUnspentOutput.new(input, output));
    }

    txBuilder.add_inputs_from(
      unspentOutputs,
      Cardano.CoinSelectionStrategyCIP2.LargestFirst
    );
    sumInputs = sumInputs.plus(2000000); // Refund STAKE
    txBuilder.set_ttl(ttl + 7200);

    const withdrawals = Cardano.Withdrawals.new();
    withdrawals.insert(
      Cardano.RewardAddress.new(this.network.network_id(), stakeCred),
      Cardano.BigNum.from_str(amount.toString())
    );

    txBuilder.set_withdrawals(withdrawals);

    txBuilder.add_change_if_needed(changeAddr);

    const txBody = txBuilder.build();

    const txHash = Cardano.hash_transaction(txBody);

    const witnesses = Cardano.TransactionWitnessSet.new();
    {
      const vkeyWitnesses = Cardano.Vkeywitnesses.new();

      vkeyWitnesses.add(
        Cardano.make_vkey_witness(txHash, spendKey.to_raw_key())
      );

      vkeyWitnesses.add(
        Cardano.make_vkey_witness(txHash, this.stakeKey.to_raw_key())
      );

      witnesses.set_vkeys(vkeyWitnesses);
    }

    const tx = Cardano.Transaction.new(txBody, witnesses);

    const tx_hash = tx.to_hex();

    const fee = txBuilder.get_fee_if_set()?.to_str() || '0';

    return { tx_hash, fee };

    // certs.add(
    //   Cardano.Certificate.new_stake_deregistration(Cardano.StakeDeregistration.new(stakeCred)),
    // );

    // txBuilder.set_certs(certs);

    // txBuilder.add_change_if_needed(changeAddr);

    // const txBody = txBuilder.build();

    // const txHash = Cardano.hash_transaction(txBody);

    // const witnesses = Cardano.TransactionWitnessSet.new();
    // {
    //   const vkeyWitnesses = Cardano.Vkeywitnesses.new();

    //   vkeyWitnesses.add(Cardano.make_vkey_witness(txHash, spendKey.to_raw_key()));

    //   vkeyWitnesses.add(Cardano.make_vkey_witness(txHash, this.stakeKey.to_raw_key()));

    //   witnesses.set_vkeys(vkeyWitnesses);
    // }

    // const tx = Cardano.Transaction.new(txBody, witnesses);

    // const tx_hash = tx.to_hex();

    // const fee = txBuilder.get_fee_if_set()?.to_str() || '0';

    // return { tx_hash, fee };
  }

  public submitTx(tx_hash: string): Promise<string> {
    return this.blockfrost.txSubmit(tx_hash);
  }
}

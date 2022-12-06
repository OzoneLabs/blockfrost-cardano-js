"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockFrostCardano = exports.WordList = exports.Chain = void 0;
const bip39 = __importStar(require("bip39"));
const Cardano = __importStar(require("@emurgo/cardano-serialization-lib-nodejs"));
const bignumber_js_1 = __importDefault(require("bignumber.js"));
const blockfrost_js_1 = require("@blockfrost/blockfrost-js");
const CARDANO_PARAMS = {
    COINS_PER_UTXO_WORD: '34482',
    MAX_TX_SIZE: 16384,
    MAX_VALUE_SIZE: 5000,
};
const MIN_BALANCE = 1000000;
const COMMON_FEE = 200000;
function harden(num) {
    return 0x80000000 + num;
}
var Chain;
(function (Chain) {
    Chain[Chain["EXTERNAL"] = 0] = "EXTERNAL";
    Chain[Chain["INTERNAL"] = 1] = "INTERNAL";
})(Chain = exports.Chain || (exports.Chain = {}));
var WordList;
(function (WordList) {
    WordList["czech"] = "czech";
    WordList["chinese_simplified"] = "chinese_simplified";
    WordList["chinese_traditional"] = "chinese_traditional";
    WordList["korean"] = "korean";
    WordList["french"] = "french";
    WordList["italian"] = "italian";
    WordList["spanish"] = "spanish";
    WordList["japanese"] = "japanese";
    WordList["portuguese"] = "portuguese";
    WordList["english"] = "english";
})(WordList = exports.WordList || (exports.WordList = {}));
class BlockFrostCardano {
    constructor(opts) {
        if (opts && opts.blockfrostProjectId) {
            this.blockfrost = new blockfrost_js_1.BlockFrostAPI({
                projectId: opts.blockfrostProjectId,
                network: opts.testnet ? 'preview' : 'mainnet',
            });
        }
        else if (opts && opts.blockfrostClient) {
            this.blockfrost = opts.blockfrostClient;
        }
        else {
            throw new Error('Either mnemonic or privateKey must be provided');
        }
        if (opts && opts.mnemonic) {
            const language = opts.language || WordList.english;
            this.rootKey = this.rootKeyFromMnemonic(opts.mnemonic, language);
        }
        else if (opts && opts.privateKey) {
            this.rootKey = this.rootKeyFromPrivateKey(opts.privateKey);
        }
        else {
            throw new Error('Either mnemonic or privateKey must be provided');
        }
        this.byron = opts.byron || false;
        this.network = opts.testnet
            ? Cardano.NetworkInfo.testnet()
            : Cardano.NetworkInfo.mainnet();
        this.stakeKey = this.createStakeKey();
        this.addresses = this.createAddresses();
    }
    static generateMnemonic(length = 12, language = WordList.english) {
        const mnemonic = bip39.generateMnemonic((length / 3) * 32, undefined, bip39.wordlists[language]);
        return mnemonic;
    }
    rootKeyFromMnemonic(mnemonic, language) {
        const entropy = bip39.mnemonicToEntropy(mnemonic, bip39.wordlists[language]);
        const rootKey = Cardano.Bip32PrivateKey.from_bip39_entropy(Buffer.from(entropy, 'hex'), Buffer.from('', 'hex'));
        return rootKey;
    }
    rootKeyFromPrivateKey(privateKey) {
        return Cardano.Bip32PrivateKey.from_bytes(Buffer.from(privateKey, 'hex'));
    }
    createStakeKey() {
        const stakeKey = this.rootKey
            .derive(harden(1852))
            .derive(harden(1815))
            .derive(harden(0))
            .derive(2)
            .derive(0);
        return stakeKey;
    }
    createSpendKey(chain, idx) {
        const spendKey = this.rootKey
            .derive(harden(this.byron ? 44 : 1852))
            .derive(harden(1815))
            .derive(harden(0))
            .derive(chain)
            .derive(idx);
        return spendKey;
    }
    createByronAddress(spendKey) {
        const byronAddr = Cardano.ByronAddress.icarus_from_key(spendKey.to_public(), this.network.protocol_magic());
        return byronAddr.to_base58();
    }
    createShellyAddress(spendKey) {
        const spendCred = Cardano.StakeCredential.from_keyhash(spendKey.to_public().to_raw_key().hash());
        const stakeCred = Cardano.StakeCredential.from_keyhash(this.stakeKey.to_public().to_raw_key().hash());
        const addrNet0 = Cardano.BaseAddress.new(this.network.network_id(), spendCred, stakeCred).to_address();
        return addrNet0.to_bech32();
    }
    createAddresses() {
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
    generateAddress(idx = 0) {
        if (idx > 20)
            throw new Error('You cannot generate more than 20 addresses.');
        const spendKey = this.createSpendKey(0, idx);
        const address = this.byron
            ? this.createByronAddress(spendKey)
            : this.createShellyAddress(spendKey);
        return address;
    }
    getStakeAddress() {
        const rewardAddr = Cardano.RewardAddress.new(this.network.network_id(), Cardano.StakeCredential.from_keyhash(this.stakeKey.to_public().to_raw_key().hash()));
        return rewardAddr.to_address().to_bech32();
    }
    async createTransferTx(fromAddress, outputAddress, outputAmount) {
        const amount = new bignumber_js_1.default(outputAmount).multipliedBy(1000000);
        const isByronAddress = Cardano.ByronAddress.is_valid(outputAddress);
        const { address, spendKey } = this.addresses.get(fromAddress);
        if (!address)
            throw new Error('This address not belong to this wallet');
        const latestBlock = await this.blockfrost.blocksLatest();
        const currentSlot = latestBlock.slot || 0;
        const inputs = await this.blockfrost.addressesUtxos(fromAddress);
        if (!inputs || !inputs.length)
            throw new Error(`You should send ADA to ${address} to have enough funds to sent a transaction`);
        const txBuilder = Cardano.TransactionBuilder.new(Cardano.TransactionBuilderConfigBuilder.new()
            .fee_algo(Cardano.LinearFee.new(Cardano.BigNum.from_str('44'), Cardano.BigNum.from_str('155381')))
            .pool_deposit(Cardano.BigNum.from_str('500000000'))
            .key_deposit(Cardano.BigNum.from_str('2000000'))
            .coins_per_utxo_word(Cardano.BigNum.from_str(CARDANO_PARAMS.COINS_PER_UTXO_WORD))
            .max_value_size(CARDANO_PARAMS.MAX_VALUE_SIZE)
            .max_tx_size(CARDANO_PARAMS.MAX_TX_SIZE)
            .build());
        const outputAddr = isByronAddress
            ? Cardano.ByronAddress.from_base58(outputAddress).to_address()
            : Cardano.Address.from_bech32(outputAddress);
        const changeAddr = this.byron
            ? Cardano.ByronAddress.from_base58(address).to_address()
            : Cardano.Address.from_bech32(address);
        const ttl = currentSlot + 7200;
        txBuilder.set_ttl(ttl);
        txBuilder.add_output(Cardano.TransactionOutput.new(outputAddr, Cardano.Value.new(Cardano.BigNum.from_str(amount.toString()))));
        const lovelaceUtxos = inputs.filter((u) => !u.amount.find((a) => a.unit !== 'lovelace'));
        const unspentOutputs = Cardano.TransactionUnspentOutputs.new();
        for (const utxo of lovelaceUtxos) {
            const amount = utxo.amount.find((a) => a.unit === 'lovelace')?.quantity;
            if (!amount)
                continue;
            const inputValue = Cardano.Value.new(Cardano.BigNum.from_str(amount.toString()));
            const input = Cardano.TransactionInput.new(Cardano.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')), utxo.output_index);
            const output = Cardano.TransactionOutput.new(changeAddr, inputValue);
            unspentOutputs.add(Cardano.TransactionUnspentOutput.new(input, output));
        }
        txBuilder.add_inputs_from(unspentOutputs, Cardano.CoinSelectionStrategyCIP2.LargestFirst);
        txBuilder.add_change_if_needed(changeAddr);
        const txBody = txBuilder.build();
        const txHash = Cardano.hash_transaction(txBody);
        const witnesses = Cardano.TransactionWitnessSet.new();
        if (this.byron) {
            const byronAddr = Cardano.ByronAddress.from_base58(address);
            const bootstrapWitnesses = Cardano.BootstrapWitnesses.new();
            const bootstrapWitness = Cardano.make_icarus_bootstrap_witness(txHash, byronAddr, spendKey);
            bootstrapWitnesses.add(bootstrapWitness);
            witnesses.set_bootstraps(bootstrapWitnesses);
        }
        else {
            const vkeyWitnesses = Cardano.Vkeywitnesses.new();
            vkeyWitnesses.add(Cardano.make_vkey_witness(txHash, spendKey.to_raw_key()));
            witnesses.set_vkeys(vkeyWitnesses);
        }
        const tx = Cardano.Transaction.new(txBody, witnesses);
        const tx_hash = tx.to_hex();
        const fee = txBuilder.get_fee_if_set()?.to_str() || '0';
        return { tx_hash, fee };
    }
    async createDelegateTx(fromAddress, poolId) {
        const { address, spendKey } = this.addresses.get(fromAddress);
        const changeAddr = Cardano.Address.from_bech32(address);
        const latestBlock = await this.blockfrost.blocksLatest();
        const ttl = latestBlock.slot || 0;
        const { active } = await this.blockfrost.accounts(this.getStakeAddress());
        const isFirstStake = !active;
        const inputs = await this.blockfrost.addressesUtxos(address);
        const stakeCred = Cardano.StakeCredential.from_keyhash(this.stakeKey.to_public().to_raw_key().hash());
        const txBuilder = Cardano.TransactionBuilder.new(Cardano.TransactionBuilderConfigBuilder.new()
            .fee_algo(Cardano.LinearFee.new(Cardano.BigNum.from_str('44'), Cardano.BigNum.from_str('155381')))
            .pool_deposit(Cardano.BigNum.from_str('500000000'))
            .key_deposit(Cardano.BigNum.from_str('2000000'))
            .coins_per_utxo_word(Cardano.BigNum.from_str(CARDANO_PARAMS.COINS_PER_UTXO_WORD))
            .max_value_size(CARDANO_PARAMS.MAX_VALUE_SIZE)
            .max_tx_size(CARDANO_PARAMS.MAX_TX_SIZE)
            .build());
        const lovelaceUtxos = inputs.filter((u) => !u.amount.find((a) => a.unit !== 'lovelace'));
        const unspentOutputs = Cardano.TransactionUnspentOutputs.new();
        for (const utxo of lovelaceUtxos) {
            const amount = utxo.amount.find((a) => a.unit === 'lovelace')?.quantity;
            if (!amount)
                continue;
            const inputValue = Cardano.Value.new(Cardano.BigNum.from_str(amount.toString()));
            const input = Cardano.TransactionInput.new(Cardano.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')), utxo.output_index);
            const output = Cardano.TransactionOutput.new(changeAddr, inputValue);
            unspentOutputs.add(Cardano.TransactionUnspentOutput.new(input, output));
        }
        txBuilder.add_inputs_from(unspentOutputs, Cardano.CoinSelectionStrategyCIP2.LargestFirst);
        txBuilder.set_ttl(ttl + 7200);
        const poolKeyHash = Cardano.Ed25519KeyHash.from_bytes(Buffer.from(poolId, 'hex'));
        const certs = Cardano.Certificates.new();
        if (isFirstStake == true) {
            certs.add(Cardano.Certificate.new_stake_registration(Cardano.StakeRegistration.new(stakeCred)));
        }
        certs.add(Cardano.Certificate.new_stake_delegation(Cardano.StakeDelegation.new(stakeCred, poolKeyHash)));
        txBuilder.set_certs(certs);
        txBuilder.add_change_if_needed(changeAddr);
        const txBody = txBuilder.build();
        const txHash = Cardano.hash_transaction(txBody);
        const witnesses = Cardano.TransactionWitnessSet.new();
        {
            const vkeyWitnesses = Cardano.Vkeywitnesses.new();
            vkeyWitnesses.add(Cardano.make_vkey_witness(txHash, spendKey.to_raw_key()));
            vkeyWitnesses.add(Cardano.make_vkey_witness(txHash, this.stakeKey.to_raw_key()));
            witnesses.set_vkeys(vkeyWitnesses);
        }
        const tx = Cardano.Transaction.new(txBody, witnesses);
        const tx_hash = tx.to_hex();
        const fee = txBuilder.get_fee_if_set()?.to_str() || '0';
        return { tx_hash, fee };
    }
    async createUnDelegateTx(fromAddress) {
        const { address, spendKey } = this.addresses.get(fromAddress);
        const changeAddr = Cardano.Address.from_bech32(address);
        const latestBlock = await this.blockfrost.blocksLatest();
        const ttl = latestBlock.slot || 0;
        const inputs = await this.blockfrost.addressesUtxos(address);
        const stakeCred = Cardano.StakeCredential.from_keyhash(this.stakeKey.to_public().to_raw_key().hash());
        const txBuilder = Cardano.TransactionBuilder.new(Cardano.TransactionBuilderConfigBuilder.new()
            .fee_algo(Cardano.LinearFee.new(Cardano.BigNum.from_str('44'), Cardano.BigNum.from_str('155381')))
            .pool_deposit(Cardano.BigNum.from_str('500000000'))
            .key_deposit(Cardano.BigNum.from_str('2000000'))
            .coins_per_utxo_word(Cardano.BigNum.from_str(CARDANO_PARAMS.COINS_PER_UTXO_WORD))
            .max_value_size(CARDANO_PARAMS.MAX_VALUE_SIZE)
            .max_tx_size(CARDANO_PARAMS.MAX_TX_SIZE)
            .build());
        let sumInputs = (0, bignumber_js_1.default)(0);
        const lovelaceUtxos = inputs.filter((u) => !u.amount.find((a) => a.unit !== 'lovelace'));
        const unspentOutputs = Cardano.TransactionUnspentOutputs.new();
        for (const utxo of lovelaceUtxos) {
            const amount = utxo.amount.find((a) => a.unit === 'lovelace')?.quantity;
            if (!amount)
                continue;
            sumInputs = sumInputs.plus(amount);
            const inputValue = Cardano.Value.new(Cardano.BigNum.from_str(amount.toString()));
            const input = Cardano.TransactionInput.new(Cardano.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')), utxo.output_index);
            const output = Cardano.TransactionOutput.new(changeAddr, inputValue);
            unspentOutputs.add(Cardano.TransactionUnspentOutput.new(input, output));
        }
        txBuilder.add_inputs_from(unspentOutputs, Cardano.CoinSelectionStrategyCIP2.LargestFirst);
        sumInputs = sumInputs.plus(2000000); // Refund STAKE
        txBuilder.set_ttl(ttl + 7200);
        const certs = Cardano.Certificates.new();
        certs.add(Cardano.Certificate.new_stake_deregistration(Cardano.StakeDeregistration.new(stakeCred)));
        txBuilder.set_certs(certs);
        txBuilder.add_change_if_needed(changeAddr);
        const txBody = txBuilder.build();
        const txHash = Cardano.hash_transaction(txBody);
        const witnesses = Cardano.TransactionWitnessSet.new();
        {
            const vkeyWitnesses = Cardano.Vkeywitnesses.new();
            vkeyWitnesses.add(Cardano.make_vkey_witness(txHash, spendKey.to_raw_key()));
            vkeyWitnesses.add(Cardano.make_vkey_witness(txHash, this.stakeKey.to_raw_key()));
            witnesses.set_vkeys(vkeyWitnesses);
        }
        const tx = Cardano.Transaction.new(txBody, witnesses);
        const tx_hash = tx.to_hex();
        const fee = txBuilder.get_fee_if_set()?.to_str() || '0';
        return { tx_hash, fee };
    }
    async createClaimRewardTx(fromAddress, rewardAmount) {
        const { address, spendKey } = this.addresses.get(fromAddress);
        const account = await this.blockfrost.accounts(this.getStakeAddress());
        const amount = new bignumber_js_1.default(rewardAmount).multipliedBy(1000000);
        if (amount.plus(account.controlled_amount).lt(MIN_BALANCE + COMMON_FEE)) {
            throw new Error("You don't have enough balance to pay transaction fee.");
        }
        const changeAddr = Cardano.Address.from_bech32(address);
        const latestBlock = await this.blockfrost.blocksLatest();
        const ttl = latestBlock.slot || 0;
        const inputs = await this.blockfrost.addressesUtxos(address);
        const stakeCred = Cardano.StakeCredential.from_keyhash(this.stakeKey.to_public().to_raw_key().hash());
        const txBuilder = Cardano.TransactionBuilder.new(Cardano.TransactionBuilderConfigBuilder.new()
            .fee_algo(Cardano.LinearFee.new(Cardano.BigNum.from_str('44'), Cardano.BigNum.from_str('155381')))
            .pool_deposit(Cardano.BigNum.from_str('500000000'))
            .key_deposit(Cardano.BigNum.from_str('2000000'))
            .coins_per_utxo_word(Cardano.BigNum.from_str(CARDANO_PARAMS.COINS_PER_UTXO_WORD))
            .max_value_size(CARDANO_PARAMS.MAX_VALUE_SIZE)
            .max_tx_size(CARDANO_PARAMS.MAX_TX_SIZE)
            .build());
        let sumInputs = (0, bignumber_js_1.default)(0);
        const lovelaceUtxos = inputs.filter((u) => !u.amount.find((a) => a.unit !== 'lovelace'));
        const unspentOutputs = Cardano.TransactionUnspentOutputs.new();
        for (const utxo of lovelaceUtxos) {
            const amount = utxo.amount.find((a) => a.unit === 'lovelace')?.quantity;
            if (!amount)
                continue;
            sumInputs = sumInputs.plus(amount);
            const inputValue = Cardano.Value.new(Cardano.BigNum.from_str(amount.toString()));
            const input = Cardano.TransactionInput.new(Cardano.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')), utxo.output_index);
            const output = Cardano.TransactionOutput.new(changeAddr, inputValue);
            unspentOutputs.add(Cardano.TransactionUnspentOutput.new(input, output));
        }
        txBuilder.add_inputs_from(unspentOutputs, Cardano.CoinSelectionStrategyCIP2.LargestFirst);
        sumInputs = sumInputs.plus(2000000); // Refund STAKE
        txBuilder.set_ttl(ttl + 7200);
        const withdrawals = Cardano.Withdrawals.new();
        withdrawals.insert(Cardano.RewardAddress.new(this.network.network_id(), stakeCred), Cardano.BigNum.from_str(amount.toString()));
        txBuilder.set_withdrawals(withdrawals);
        txBuilder.add_change_if_needed(changeAddr);
        const txBody = txBuilder.build();
        const txHash = Cardano.hash_transaction(txBody);
        const witnesses = Cardano.TransactionWitnessSet.new();
        {
            const vkeyWitnesses = Cardano.Vkeywitnesses.new();
            vkeyWitnesses.add(Cardano.make_vkey_witness(txHash, spendKey.to_raw_key()));
            vkeyWitnesses.add(Cardano.make_vkey_witness(txHash, this.stakeKey.to_raw_key()));
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
    submitTx(tx_hash) {
        return this.blockfrost.txSubmit(tx_hash);
    }
}
exports.BlockFrostCardano = BlockFrostCardano;

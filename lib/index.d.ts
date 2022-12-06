import * as Cardano from '@emurgo/cardano-serialization-lib-nodejs';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
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
export declare enum Chain {
    EXTERNAL = 0,
    INTERNAL = 1
}
export declare enum WordList {
    czech = "czech",
    chinese_simplified = "chinese_simplified",
    chinese_traditional = "chinese_traditional",
    korean = "korean",
    french = "french",
    italian = "italian",
    spanish = "spanish",
    japanese = "japanese",
    portuguese = "portuguese",
    english = "english"
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
export declare class BlockFrostCardano {
    rootKey: Cardano.Bip32PrivateKey;
    stakeKey: Cardano.Bip32PrivateKey;
    byron: boolean;
    network: Cardano.NetworkInfo;
    addresses: Map<string, Address>;
    blockfrost: BlockFrostAPI;
    constructor(opts: BlockFrostCardanoOptions);
    static generateMnemonic(length?: number, language?: WordList): string;
    private rootKeyFromMnemonic;
    private rootKeyFromPrivateKey;
    private createStakeKey;
    private createSpendKey;
    private createByronAddress;
    private createShellyAddress;
    private createAddresses;
    generateAddress(idx?: number): string;
    getStakeAddress(): string;
    createTransferTx(fromAddress: string, outputAddress: string, outputAmount: string): Promise<TransactionOutput>;
    createDelegateTx(fromAddress: string, poolId: string): Promise<{
        tx_hash: string;
        fee: string;
    }>;
    createUnDelegateTx(fromAddress: string): Promise<{
        tx_hash: string;
        fee: string;
    }>;
    createClaimRewardTx(fromAddress: string, rewardAmount: string): Promise<{
        tx_hash: string;
        fee: string;
    }>;
    submitTx(tx_hash: string): Promise<string>;
}

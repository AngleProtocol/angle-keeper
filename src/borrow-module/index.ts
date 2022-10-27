import { CONTRACTS_ADDRESSES } from '@angleprotocol/sdk';
import { Erc20, ERC20_Abi, Oracle, Treasury, VaultManager } from '@angleprotocol/sdk/dist/constants/interfaces';
import { TransactionReceipt } from '@ethersproject/abstract-provider';
import { BigNumber, Contract, providers, utils, Wallet } from 'ethers';

import { estimateGasParams, sendWithFlashbots } from '../tx-flashbots';
import { MULTICALL_ABI, ORACLE_ABI, TREASURY_ABI, VAULT_MANAGER_ABI } from './abis';
import { checkLiquidations, computeLiquidationsParams, LiquidateParams } from './computeLiquidations';
import { getVaultManagersFromTreasury } from './helpers';
import { getOracleValues } from './oracles';
import { httpProvider, wallet } from '../provider';

// ============================== Addresses ====================================

const DATA_PER_CHAIN = {
  1: {
    PROVIDER: httpProvider(1),
    SIGNER: wallet,

    TREASURY: CONTRACTS_ADDRESSES[1].agEUR.Treasury!,
    SWAPPER: CONTRACTS_ADDRESSES[1].agEUR.Swapper!,
    MULTICALL_READ_WITH_FAILURE: CONTRACTS_ADDRESSES[1].MulticallWithFailure!,
    MULTICALL_EXECUTOR: CONTRACTS_ADDRESSES[1].KeeperMulticall!,

    wStETH: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
    WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',

    agEUR: CONTRACTS_ADDRESSES[1].agEUR.AgToken!,
    oraclesAgToken_USD: {
      EUR: '0xb49f677943BC038e9857d61E7d053CaA2C1734C1',
    },
    ORACLE_ETH_USD: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', // ETH/USD

    NATIVE_TOKEN: 'ETH',
  },
  137: {
    PROVIDER: httpProvider(137),
    SIGNER: wallet,

    TREASURY: CONTRACTS_ADDRESSES[137].agEUR.Treasury!,
    SWAPPER: CONTRACTS_ADDRESSES[137].agEUR.Swapper!,
    MULTICALL_READ_WITH_FAILURE: '0xAd96B6342e4EbbbFBAfF0DF248E84C7304fFF5a5',
    MULTICALL_EXECUTOR: '',

    wMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',

    agEUR: CONTRACTS_ADDRESSES[137].agEUR.AgToken!,
    oraclesAgToken_USD: {
      EUR: '0x73366Fe0AA0Ded304479862808e02506FE556a98',
    },
    ORACLE_ETH_USD: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0', // MATIC/USD

    NATIVE_TOKEN: 'MATIC',
  },
  10: {
    PROVIDER: httpProvider(10),
    SIGNER: wallet,

    TREASURY: CONTRACTS_ADDRESSES[10].agEUR.Treasury!,
    SWAPPER: CONTRACTS_ADDRESSES[10].agEUR.Swapper!,
    MULTICALL_READ_WITH_FAILURE: CONTRACTS_ADDRESSES[10].MulticallWithFailure!,
    MULTICALL_EXECUTOR: '',

    wStETH: '',
    WETH: '0x4200000000000000000000000000000000000006',

    agEUR: CONTRACTS_ADDRESSES[10].agEUR.AgToken!,
    oraclesAgToken_USD: {
      EUR: '0x3626369857A10CcC6cc3A6e4f5C2f5984a519F20',
    },
    ORACLE_ETH_USD: '0x13e3Ee699D1909E989722E753853AE30b17e08c5',

    NATIVE_TOKEN: 'ETH',
  },
  42161: {
    PROVIDER: httpProvider(42161),
    SIGNER: wallet,

    TREASURY: CONTRACTS_ADDRESSES[42161].agEUR.Treasury!,
    SWAPPER: CONTRACTS_ADDRESSES[42161].agEUR.Swapper!,
    MULTICALL_READ_WITH_FAILURE: CONTRACTS_ADDRESSES[42161].MulticallWithFailure!,
    MULTICALL_EXECUTOR: '',

    wStETH: '',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',

    agEUR: CONTRACTS_ADDRESSES[42161].agEUR.AgToken!,
    oraclesAgToken_USD: {
      EUR: '0xA14d53bC1F1c0F31B4aA3BD109344E5009051a84',
    },
    ORACLE_ETH_USD: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',

    NATIVE_TOKEN: 'ETH',
  },
};

export async function onChainCheckLiquidation(chainId: keyof typeof DATA_PER_CHAIN, stable: 'EUR' = 'EUR') {
  console.log(`========= COMPUTE LIQUIDATIONS FOR CHAIN ${chainId} =========`);

  const { PROVIDER, SIGNER, NATIVE_TOKEN, ...CONTRACTS } = DATA_PER_CHAIN[chainId];

  const provider = PROVIDER;
  const signer = SIGNER.connect(PROVIDER);

  const vaultManagers = await getVaultManagersFromTreasury(new Contract(CONTRACTS.TREASURY, TREASURY_ABI, provider) as Treasury);
  const { oracleAgToken_USD, oracleETH_USD } = await getOracleValues(
    provider,
    CONTRACTS.oraclesAgToken_USD[stable],
    CONTRACTS.ORACLE_ETH_USD
  );

  console.log(`
  ORACLES
  oracle ${stable}/USD: ${utils.formatUnits(oracleAgToken_USD, 8)}
  oracle ${NATIVE_TOKEN}/USD: ${utils.formatUnits(oracleETH_USD, 8)}
  `);

  for (const vaultManager of vaultManagers) {
    const vaultManagerContract = new Contract(vaultManager, VAULT_MANAGER_ABI, provider) as VaultManager;
    const multicall = new Contract(CONTRACTS.MULTICALL_READ_WITH_FAILURE, MULTICALL_ABI, provider);
    const oracle = new Contract(await vaultManagerContract.oracle(), ORACLE_ABI, provider) as Oracle;

    const numberOfVaults = (await vaultManagerContract.vaultIDCount()).toNumber();
    console.log('numberOfVaults', numberOfVaults);

    const oracleValue = (await oracle.read()) as BigNumber;

    const stablecoin = await vaultManagerContract.stablecoin();
    const stableCoinContract = new Contract(stablecoin, ERC20_Abi, provider) as Erc20;

    const collateral = await vaultManagerContract.collateral();
    const collatContract = new Contract(collateral, ERC20_Abi, signer) as Erc20;
    const collatBase = await collatContract.decimals();
    console.log('collatBase', collatBase);

    const vaultName = await vaultManagerContract.name();
    console.log(`\nVault: ${vaultName} (${numberOfVaults} vaults)`);

    console.log(`
    BALANCES BEFORE
    collateral: ${utils.formatEther(await collatContract.balanceOf(signer.address))}
    agEUR: ${utils.formatEther(await stableCoinContract.balanceOf(signer.address))}
    `);

    console.log('surplus before (agEUR): ', utils.formatEther(await vaultManagerContract.surplus()), '\n');

    /*
    // ============================== method 2 ====================================
    Directly call checkLiquidation on each vault
    WARNING: if there are a lot of vault we need to check that the call doesn't revert (because there is a gas limit on view calls too)
    */
    const checkLiquidation = await checkLiquidations(numberOfVaults, vaultManager, vaultManagerContract, multicall, signer.address);
    if (checkLiquidation.length === 0) {
      console.log('no liquidation needed');
      continue;
    }

    const liquidationsData = await computeLiquidationsParams(checkLiquidation, {
      collatBase,
      oracleValue,
      collateral,
      stablecoin,
      swapperContract: CONTRACTS.SWAPPER,
      keeperAddress: signer.address,
      oracleAgToken_USD,
      provider,
      chainId,
    });

    if (!liquidationsData) continue;

    const { liquidateParams, agTokenLeftToKeeperInUSD } = liquidationsData;

    const executedLiquidation = await executeLiquidation(vaultManagerContract, liquidateParams, agTokenLeftToKeeperInUSD, {
      withFlashbots: chainId === 1 ? true : false,
      oracleETH_USD,
      provider,
      vaultName,
      collatContract,
      stableCoinContract,
      signer,
      chainId,
    });

    // Liquidation of all vaults at once is not profitable
    // We compute liquidation one by one to see if vaults should be liquidated individually
    if (!executedLiquidation) {
      for (const liquidable of checkLiquidation) {
        const liquidationsData = await computeLiquidationsParams([liquidable], {
          collatBase,
          oracleValue,
          collateral,
          stablecoin,
          swapperContract: CONTRACTS.SWAPPER,
          keeperAddress: signer.address,
          oracleAgToken_USD,
          provider,
          chainId,
        });

        if (!liquidationsData) continue;
        const { liquidateParams, agTokenLeftToKeeperInUSD } = liquidationsData;

        await executeLiquidation(vaultManagerContract, liquidateParams, agTokenLeftToKeeperInUSD, {
          withFlashbots: chainId === 1 ? true : false,
          oracleETH_USD,
          provider,
          vaultName,
          collatContract,
          stableCoinContract,
          signer,
          chainId,
        });
      }
    }
  }
}

async function executeLiquidation(
  vaultManagerContract: VaultManager,
  liquidateParams: LiquidateParams,
  agTokenLeftToKeeperInUSD: BigNumber,
  {
    withFlashbots,
    provider,
    oracleETH_USD,
    vaultName,
    collatContract,
    stableCoinContract,
    signer,
    chainId,
  }: {
    vaultName: string;
    collatContract: Contract;
    stableCoinContract: Contract;
    withFlashbots: boolean;
    provider: providers.JsonRpcProvider;
    oracleETH_USD: BigNumber;
    signer: Wallet;
    chainId: keyof typeof DATA_PER_CHAIN;
  }
) {
  const estimatedGas = await vaultManagerContract
    .connect(signer)
    .estimateGas['liquidate(uint256[],uint256[],address,address,address,bytes)'](...liquidateParams, { gasLimit: 3e6 });
  const currentGasPrice = await provider.getGasPrice();
  const estimatedGasCostInUSD = estimatedGas.mul(currentGasPrice).mul(oracleETH_USD).div(utils.parseUnits('1', 26));
  console.log(`estimatedGasCostInUSD $${estimatedGasCostInUSD}`);

  if (agTokenLeftToKeeperInUSD.sub(estimatedGasCostInUSD).gt(0)) {
    console.log('LIQUIDATION IS PROFITABLE');

    // ============================== LIQUIDATION ====================================
    // With Flashbots
    if (withFlashbots) {
      const gasParams = await estimateGasParams(provider);
      const tx = await vaultManagerContract.populateTransaction['liquidate(uint256[],uint256[],address,address,address,bytes)'](
        ...liquidateParams,
        {
          ...gasParams,
          gasLimit: 3e6,
        }
      );
      console.log('sending liquidation with Flashbots', tx);
      await sendWithFlashbots(tx, provider, signer);
    } else {
      const overridesPerChain = {
        1: {},
        137: {
          maxPriorityFeePerGas: 80e9,
          maxFeePerGas: 300e9,
        },
        10: {},
        42161: {},
      };

      // Without Flashbots
      const tx = await vaultManagerContract
        .connect(signer)
        ['liquidate(uint256[],uint256[],address,address,address,bytes)'](...liquidateParams, {
          gasLimit: 3e6,
          ...overridesPerChain[chainId],
        });
      console.log('liquidation tx', tx);
      const receipt = (await tx.wait()) as TransactionReceipt;
      console.log('gasUsed', receipt.gasUsed.toNumber());
      console.log('liquidation receipt', receipt);
      console.log(`Liquidation done for vault ${vaultName}`);
      console.log('BALANCES AFTER');
      console.log('collateral: ', utils.formatEther(await collatContract.balanceOf(signer.address)));
      console.log('agEUR: ', utils.formatEther(await stableCoinContract.balanceOf(signer.address)));
      console.log('surplus (agEUR): ', utils.formatEther(await vaultManagerContract.surplus()));
    }

    return true;
  }
  return false;
}

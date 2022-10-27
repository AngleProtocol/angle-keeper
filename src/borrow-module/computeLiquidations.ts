import { Interfaces } from '@angleprotocol/sdk';
import { VaultManager } from '@angleprotocol/sdk/dist/constants/interfaces';
import { BigNumber, constants, Contract, providers, utils } from 'ethers';

import { get1inchSwapData } from '../utils';
import { encodeSwapperData, encodeSwapperDataSidechain } from './helpers';

// ============================== Types ====================================
export type LiquidationOpportunity = {
  // Maximum stablecoin amount that can be repaid upon liquidating the vault
  maxStablecoinAmountToRepay: BigNumber;
  // Collateral amount given to the person in the case where the maximum amount to repay is given
  maxCollateralAmountGiven: BigNumber;
  // Threshold value of stablecoin amount to repay: it is ok for a liquidator to repay below threshold,
  // but if this threshold is non null and the liquidator wants to repay more than threshold, it should repay
  // the max stablecoin amount given in this vault
  thresholdRepayAmount: BigNumber;
  // Discount proposed to the liquidator on the collateral
  discount: BigNumber;
  // Amount of debt in the vault
  currentDebt: BigNumber;
};

export type VaultData = { collateralAmount: BigNumber; normalizedDebt: BigNumber };
export type WithVaultId<T> = T & { vaultId: number };

export async function checkLiquidations(
  numberOfVaults: number,
  vaultManager: string,
  vaultManagerContract: VaultManager,
  multicall: Contract,
  liquidator: string
) {
  const calls_checkLiquidation = [];
  for (let i = 1; i < numberOfVaults + 1; i++) {
    calls_checkLiquidation.push({
      target: vaultManager,
      data: vaultManagerContract.interface.encodeFunctionData('checkLiquidation', [i, liquidator]),
      canFail: true,
    });
  }

  const checkLiquidation = (await multicall.multiCall(calls_checkLiquidation))
    .map((_data: string, i: number) => ({ vaultId: i + 1, data: _data }))
    .filter(({ data }: { data: string }) => {
      // data !== vaultManagerContract.interface.getSighash('HealthyVault()')
      try {
        vaultManagerContract.interface.decodeFunctionResult('checkLiquidation', data);
      } catch (e) {
        return false;
      }
      return true;
    })
    .map((_data: { vaultId: number; data: string }) => ({
      vaultId: _data.vaultId,
      ...vaultManagerContract.interface.decodeFunctionResult('checkLiquidation', _data.data).liqOpp,
    })) as WithVaultId<LiquidationOpportunity>[];

  return checkLiquidation;
}

type InputParams = {
  collatBase: number;
  oracleValue: BigNumber;
  collateral: string;
  stablecoin: string;
  swapperContract: string;
  keeperAddress: string;
  oracleAgToken_USD: BigNumber;
  provider: providers.JsonRpcProvider;
  chainId: number;
};

export type LiquidateParams = [number[], BigNumber[], string, string, string, string];

export async function computeLiquidationsParams(
  liquidableVaults: WithVaultId<LiquidationOpportunity>[],
  { collatBase, collateral, stablecoin, oracleValue, swapperContract, keeperAddress, oracleAgToken_USD, provider, chainId }: InputParams
): Promise<{
  liquidateParams: LiquidateParams;
  agTokenLeftToKeeperInUSD: BigNumber;
} | void> {
  let totalCollateral = BigNumber.from(0);
  const vaultIds: number[] = [];
  const stablecoinAmountsToRepay: BigNumber[] = [];
  let totalStableCoinAmountToRepay = BigNumber.from(0);
  const discounts: { vaultId: number; discount: string }[] = [];

  for (const liquidable of liquidableVaults) {
    // 1Inch
    console.log(`
      maxStablecoinAmountToRepay: ${utils.formatEther(liquidable.maxStablecoinAmountToRepay)}
      maxCollateralAmountGiven: ${utils.formatUnits(liquidable.maxCollateralAmountGiven, collatBase)}
      thresholdRepayAmount: ${utils.formatEther(liquidable.thresholdRepayAmount)}
      discount: ${utils.formatUnits(liquidable.discount, 9)}
      currentDebt: ${utils.formatEther(liquidable.currentDebt)}
    `);

    vaultIds.push(liquidable.vaultId);
    stablecoinAmountsToRepay.push(liquidable.maxStablecoinAmountToRepay);

    totalCollateral = totalCollateral.add(liquidable.maxCollateralAmountGiven);
    totalStableCoinAmountToRepay = totalStableCoinAmountToRepay.add(liquidable.maxStablecoinAmountToRepay);

    discounts.push({ discount: utils.formatUnits(utils.parseUnits('1', 9).sub(liquidable.discount), 9), vaultId: liquidable.vaultId });
  }

  const rewardToBeReceived = totalCollateral.mul(oracleValue).div(utils.parseUnits('1', collatBase)).sub(totalStableCoinAmountToRepay);

  // Before executing the liquidation, we need to make sure there is enough agEUR on-chain
  // we check our own balance and the rest is swapped with 1Inch
  const agTokenContract = new Contract(stablecoin, Interfaces.ERC20_Interface, provider);
  const keeperBalanceAgToken = (await agTokenContract.balanceOf(keeperAddress)) as BigNumber;

  const slippage = 1; // 1 %
  const minAmountOut = totalStableCoinAmountToRepay.mul(100 - slippage).div(100);
  const oneInchData = await get1inchSwapData(chainId, collateral, stablecoin, swapperContract, totalCollateral.toString(), slippage, true);
  let swapperData: string;
  if (chainId === 1) {
    swapperData = encodeSwapperData(constants.AddressZero, keeperAddress, minAmountOut, 1, 0, oneInchData.tx.data);
  } else {
    swapperData = encodeSwapperDataSidechain(keeperAddress, minAmountOut, 1, oneInchData.tx.data);
  }

  const toTokenAmount = BigNumber.from(oneInchData.toTokenAmount);

  const agTokenLeftToKeeper = toTokenAmount.sub(totalStableCoinAmountToRepay);

  console.log(`
    rewardToBeReceived: ${utils.formatUnits(rewardToBeReceived, collatBase)}
    totalStableCoinAmountToRepay: ${utils.formatEther(totalStableCoinAmountToRepay)}
    toTokenAmount: ${utils.formatEther(toTokenAmount)}
  `);

  // how much we should be receiving for a swap with 0 slippage
  const agEurAtOracleValue = toTokenAmount.mul(oracleValue).div(utils.parseEther('1'));
  if (
    agEurAtOracleValue
      .mul(100 - slippage)
      .div(100)
      .lt(toTokenAmount)
  ) {
    console.log('Swap should fail due to slippage');
  }

  // if there is not enough liquidity on this chain
  // we need to bridge back some
  if (keeperBalanceAgToken.add(toTokenAmount).lt(totalStableCoinAmountToRepay)) {
    console.log('WE NEED TO BRIDGE SOME LIQUIDITY');
    return;
  }

  // if the amount we get from 1Inch is less than the stables to repay, we exit
  if (agTokenLeftToKeeper.lte(0)) {
    console.log('1Inch returning less agEUR than needed for liquidation');
    return;
  }

  const agTokenLeftToKeeperInUSD = agTokenLeftToKeeper.mul(oracleAgToken_USD).div(utils.parseUnits('1', 8));
  console.log(`agTokenLeftToKeeper €${utils.formatEther(agTokenLeftToKeeper)} -> $${utils.formatEther(agTokenLeftToKeeperInUSD)}`);

  const liquidateParams = [
    vaultIds,
    stablecoinAmountsToRepay,
    keeperAddress,
    swapperContract,
    swapperContract,
    swapperData,
  ] as LiquidateParams;

  return { liquidateParams, agTokenLeftToKeeperInUSD };
}

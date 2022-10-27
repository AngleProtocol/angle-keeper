import { Treasury } from '@angleprotocol/sdk/dist/constants/interfaces';
import { BigNumberish, utils } from 'ethers';

export const encodeSwapperData = (
  intermediateToken: string,
  to: string,
  minAmountOut: BigNumberish,
  swapType: BigNumberish,
  mintOrBurn: BigNumberish,
  data: string
) =>
  utils.defaultAbiCoder.encode(
    ['address', 'address', 'uint256', 'uint128', 'uint128', 'bytes'],
    [intermediateToken, to, minAmountOut, swapType, mintOrBurn, data]
  );

export const encodeSwapperDataSidechain = (to: string, minAmountOut: BigNumberish, swapType: BigNumberish, data: string) =>
  utils.defaultAbiCoder.encode(['address', 'uint256', 'uint128', 'bytes'], [to, minAmountOut, swapType, data]);

export async function getVaultManagersFromTreasury(treasury: Treasury) {
  const vaultManagers: string[] = [];

  let success = true;
  let index = 0;
  while (success) {
    try {
      vaultManagers.push(await treasury.vaultManagerList(index));
    } catch {
      success = false;
    }
    index += 1;
  }
  return vaultManagers;
}

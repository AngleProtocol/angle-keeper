import { BigNumber, Contract, providers } from 'ethers';

const ABI = [
  'function latestRoundData() external view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)',
];
export async function getOracleValues(provider: providers.JsonRpcProvider, addressOracleAgTokenToUSD: string, addressOracleETHUSD: string) {
  const oracleAgTokenToUSD = new Contract(addressOracleAgTokenToUSD, ABI, provider);
  const oracle_ETH_USD = new Contract(addressOracleETHUSD, ABI, provider);

  const oracleAgToken_USD = (await oracleAgTokenToUSD.latestRoundData()).answer as BigNumber;
  const oracleETH_USD = (await oracle_ETH_USD.latestRoundData()).answer as BigNumber;

  return { oracleAgToken_USD, oracleETH_USD };
}

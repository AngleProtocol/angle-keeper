import axios from 'axios';
import { BigNumber } from 'ethers';
import qs from 'node:querystring';

// add 50%
export async function estimateGas(estimator: Promise<BigNumber>, percentage = 50): Promise<BigNumber> {
  const estimatedGas = await estimator;
  return estimatedGas.mul(BigNumber.from(100 + percentage)).div(BigNumber.from(100));
}

export async function get1inchSwapData(
  chainId: number,
  fromTokenAddress: string,
  toTokenAddress: string,
  fromAddress: string,
  amount: string,
  slippage: number,
  disableEstimate = false
): Promise<{
  fromToken: Record<string, any>;
  toToken: Record<string, any>;
  toTokenAmount: string;
  fromTokenAmount: string;
  protocols: any[];
  tx: Record<string, any>;
}> {
  const oneInchParams = qs.stringify({
    fromTokenAddress,
    toTokenAddress,
    fromAddress,
    amount,
    slippage,
    disableEstimate,
  });
  const url = `https://api.1inch.exchange/v4.0/${chainId}/swap?${oneInchParams}`;

  const res = await axios.get(url);
  return res.data;
}

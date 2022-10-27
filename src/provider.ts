import { requireEnvVars } from '@angleprotocol/sdk';
import { providers, Wallet } from 'ethers';

const { RPC_URL, SIGNER_PRIVATE_KEY, ALCHEMY_KEY } = requireEnvVars(['RPC_URL', 'SIGNER_PRIVATE_KEY', 'ALCHEMY_KEY']);

export const wallet = new Wallet(SIGNER_PRIVATE_KEY);

export const httpProvider = (chainId: number) => {
  if (chainId) return new providers.AlchemyProvider(chainId, ALCHEMY_KEY as string);
  return new providers.JsonRpcProvider(RPC_URL);
};

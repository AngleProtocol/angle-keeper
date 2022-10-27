import { Interfaces } from '@angleprotocol/sdk';

export const VAULT_MANAGER_ABI = Interfaces.VaultManager__factory.createInterface();

export const MULTICALL_ABI = [
  'function multiCall(tuple(address target,bytes data,bool canFail)[] memory calls) external view returns (bytes[] memory)',
];

export const ORACLE_ABI = Interfaces.Oracle__factory.createInterface();

export const TREASURY_ABI = Interfaces.Treasury__factory.createInterface();

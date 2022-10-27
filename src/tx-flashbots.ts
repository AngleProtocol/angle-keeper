import { FlashbotsBundleProvider, FlashbotsTransactionResponse } from '@flashbots/ethers-provider-bundle';
import { PopulatedTransaction, providers, utils, Wallet } from 'ethers';

export async function sendWithFlashbots(tx: PopulatedTransaction, provider: providers.JsonRpcProvider, signer: Wallet) {
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, signer);

  // Add chainId = 1 otherwise Flashbots fails
  tx.chainId = 1;

  const signedTransactions = await flashbotsProvider.signBundle([
    {
      transaction: tx,
      signer,
    },
  ]);

  const blockNumber = await provider.getBlockNumber();
  const simulation = await flashbotsProvider.simulate(signedTransactions, blockNumber + 1);

  if ('error' in simulation) {
    console.log(`Simulation Error: ${simulation.error.message}`);
    return;
  }

  console.log(`Simulation Success: ${blockNumber} ${JSON.stringify(simulation, null, 2)}`);
  let bundleHash: string | undefined;
  for (let i = 1; i <= 10; i++) {
    const bundleSubmission = await flashbotsProvider.sendRawBundle(signedTransactions, blockNumber + i);
    console.log(`submitted for block #${blockNumber + i}. Bundle hash: ${(bundleSubmission as FlashbotsTransactionResponse).bundleHash}`);
    bundleHash = (bundleSubmission as FlashbotsTransactionResponse).bundleHash;
  }
  return bundleHash;
}

export async function estimateGasParams(provider: providers.JsonRpcProvider, futureBlock = 5) {
  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);

  const BLOCKS_IN_THE_FUTURE = futureBlock;
  const maxBaseFeeInFutureBlock = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(block.baseFeePerGas!, BLOCKS_IN_THE_FUTURE);

  const PRIORITY_FEE = utils.parseUnits('6', 9);

  return {
    maxFeePerGas: PRIORITY_FEE.add(maxBaseFeeInFutureBlock),
    maxPriorityFeePerGas: PRIORITY_FEE,
    type: 2,
  };
}

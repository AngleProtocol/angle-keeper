import 'dotenv/config';

import { onChainCheckLiquidation } from './borrow-module';

let runningLoop: NodeJS.Timeout;

const restartLoop = () => {
  if (runningLoop) clearTimeout(runningLoop);
  runningLoop = setTimeout(loop, 5 * 1000);
};

console.log('start...');
restartLoop();

async function loop() {
  await onChainCheckLiquidation(1, 'EUR');
  await onChainCheckLiquidation(137, 'EUR');
  await onChainCheckLiquidation(10, 'EUR');
  await onChainCheckLiquidation(42161, 'EUR');

  restartLoop();
}

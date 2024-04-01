import { Wallet } from '@rainbow-me/rainbowkit';
import {
  burnerWalletId,
  burnerWalletName,
  createBurnerConnector,
} from './burnerConnector';
import { burnerWalletIconBase64 } from './burnerWalletIconBase64';

/**
 * Wagmi config for burner wallet
 */
export const burnerWalletConfig = (): Wallet => ({
  id: burnerWalletId,
  name: burnerWalletName,
  iconUrl: burnerWalletIconBase64,
  iconBackground: '#ffffff',
  createConnector: () => {
    return createBurnerConnector();
  },
});

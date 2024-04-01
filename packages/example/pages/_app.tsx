import "@rainbow-me/rainbowkit/styles.css";
import "./global.css";

import {
  AvatarComponent,
  type Chain,
  DisclaimerComponent,
  Locale,
  RainbowKitProvider,
  darkTheme,
  getDefaultConfig,
  getDefaultWallets,
  lightTheme,
  midnightTheme,
  Wallet,
} from "@rainbow-me/rainbowkit";
import {
  GetSiweMessageOptions,
  RainbowKitSiweNextAuthProvider,
} from "@rainbow-me/rainbowkit-siwe-next-auth";
import {
  argentWallet,
  bifrostWallet,
  bitgetWallet,
  bitskiWallet,
  bitverseWallet,
  bloomWallet,
  bybitWallet,
  clvWallet,
  coin98Wallet,
  coreWallet,
  dawnWallet,
  desigWallet,
  enkryptWallet,
  foxWallet,
  frameWallet,
  frontierWallet,
  gateWallet,
  imTokenWallet,
  kresusWallet,
  ledgerWallet,
  mewWallet,
  oktoWallet,
  okxWallet,
  omniWallet,
  oneInchWallet,
  oneKeyWallet,
  phantomWallet,
  rabbyWallet,
  ramperWallet,
  roninWallet,
  safeheronWallet,
  safepalWallet,
  subWallet,
  tahoWallet,
  talismanWallet,
  tokenPocketWallet,
  tokenaryWallet,
  trustWallet,
  uniswapWallet,
  xdefiWallet,
  zealWallet,
  zerionWallet,
} from "@rainbow-me/rainbowkit/wallets";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { SessionProvider, signOut } from "next-auth/react";
import type { AppProps } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import {
  WagmiProvider,
  createConnector,
  normalizeChainId,
  useDisconnect,
} from "wagmi";
import {
  arbitrum,
  arbitrumSepolia,
  avalancheFuji,
  base,
  baseSepolia,
  blast,
  blastSepolia,
  bsc,
  holesky,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonMumbai,
  ronin,
  sepolia,
  zkSync,
  zora,
  zoraSepolia,
} from "wagmi/chains";

import { AppContextProps } from "../lib/AppContextProps";

/*
 * TODO: Need to find better way to handle `getProvider`
 * TODO: Burner Wallet does not show in Rainbow wallets
 * If we don't find any good solution might need to implement our provider
 * Good reference: https://github.com/safe-global/safe-apps-sdk/blob/main/packages/safe-apps-provider/src/provider.ts#L1
 * Using ethers `EIP1193ProviderBridge` to create a provider also does not work properly
 * @example:
 * ```ts
 * const provider = new EIP1193ProviderBridge(wallet, provider);
 * ```
 */
import {
  EIP1193RequestFn,
  Hex,
  RpcRequestError,
  SwitchChainError,
  Transport,
  WalletRpcSchema,
  createWalletClient,
  custom,
  fromHex,
  getAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getHttpRpcClient, hexToBigInt, numberToHex } from "viem/utils";
import { SendTransactionParameters } from "viem/zksync";
import { BaseError } from "wagmi";

// --------------------------------------------------------------------

const loadBurnerSK = () =>
  // NOTE: This is raondomly generate private key, do not try to fund it or use it. Anything you send to this address will be lost.
  `0x264d2f223bdccc89961a711702a1b556575b49a92ab33e71518ee3451cf3aa98` as const;

export const burnerWalletId = "burnerWallet";
export const burnerWalletName = "Burner Wallet";

export class ConnectorNotConnectedError extends BaseError {
  override name = "ConnectorNotConnectedError";
  constructor() {
    super("Connector not connected.");
  }
}

export class ChainNotConfiguredError extends BaseError {
  override name = "ChainNotConfiguredError";
  constructor() {
    super("Chain not configured.");
  }
}

type Provider = ReturnType<
  Transport<"custom", Record<any, any>, EIP1193RequestFn<WalletRpcSchema>>
>;

export const createBurnerConnector = () => {
  let connected = true;
  let connectedChainId: number;
  return createConnector<Provider>((config) => ({
    id: burnerWalletId,
    name: burnerWalletName,
    type: "burnerWallet",
    async connect({ chainId } = {}) {
      const provider = await this.getProvider();
      const accounts = await provider.request({
        method: "eth_accounts",
      });
      let currentChainId = await this.getChainId();
      if (chainId && currentChainId !== chainId && this.switchChain) {
        const chain = await this.switchChain({ chainId });
        currentChainId = chain.id;
      }
      connected = true;
      return { accounts, chainId: currentChainId };
    },
    async getProvider({ chainId } = {}) {
      const chain =
        config.chains.find((x) => x.id === chainId) ?? config.chains[0];

      const url = chain.rpcUrls.default.http[0];
      const burnerAccount = privateKeyToAccount(loadBurnerSK());
      const client = createWalletClient({
        chain: chain,
        account: burnerAccount,
        transport: http(),
      });

      const request: EIP1193RequestFn = async ({ method, params }) => {
        if (method === "eth_sendTransaction") {
          const actualParams = (params as SendTransactionParameters[])[0];
          const value = actualParams.value
            ? hexToBigInt(actualParams.value as unknown as Hex)
            : undefined;
          const hash = await client.sendTransaction({
            ...(params as SendTransactionParameters[])[0],
            value,
          });
          return hash;
        }

        if (method === "eth_accounts") {
          return [burnerAccount.address];
        }

        if (method === "wallet_switchEthereumChain") {
          type Params = [{ chainId: Hex }];
          connectedChainId = fromHex((params as Params)[0].chainId, "number");
          this.onChainChanged(connectedChainId.toString());
          return;
        }

        const body = { method, params };
        const httpClient = getHttpRpcClient(url);
        const { error, result } = await httpClient.request({ body });
        if (error) throw new RpcRequestError({ body, error, url });

        return result;
      };

      return custom({ request })({ retryCount: 0 });
    },
    onChainChanged(chain) {
      const chainId = normalizeChainId(chain);
      config.emitter.emit("change", { chainId });
    },
    async getAccounts() {
      if (!connected) throw new ConnectorNotConnectedError();
      const provider = await this.getProvider();
      const accounts = await provider.request({ method: "eth_accounts" });
      return [accounts.map((x) => getAddress(x))[0]];
    },
    async onDisconnect() {
      config.emitter.emit("disconnect");
      connected = false;
    },
    async getChainId() {
      const provider = await this.getProvider();
      const hexChainId = await provider.request({ method: "eth_chainId" });
      return fromHex(hexChainId, "number");
    },
    async isAuthorized() {
      if (!connected) return false;
      const accounts = await this.getAccounts();
      return !!accounts.length;
    },
    onAccountsChanged(accounts) {
      if (accounts.length === 0) this.onDisconnect();
      else
        config.emitter.emit("change", {
          accounts: accounts.map((x) => getAddress(x)),
        });
    },
    async switchChain({ chainId }) {
      const provider = await this.getProvider();
      const chain = config.chains.find((x) => x.id === chainId);
      if (!chain) throw new SwitchChainError(new ChainNotConfiguredError());

      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: numberToHex(chainId) }],
      });
      return chain;
    },
    disconnect() {
      console.log("disconnect from burnerwallet");
      connected = false;
      return Promise.resolve();
    },
  }));
};

export type BurnerWalletOptions = {
  chains: Chain[];
};

const burnerWalletIconBase64 =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzUzIiBoZWlnaHQ9IjM1MiIgdmlld0JveD0iMCAwIDM1MyAzNTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHg9IjAuNzE2MzA5IiB5PSIwLjMxNzEzOSIgd2lkdGg9IjM1MS4zOTQiIGhlaWdodD0iMzUxLjM5NCIgZmlsbD0idXJsKCNwYWludDBfbGluZWFyXzNfMTUxKSIvPgo8Y2lyY2xlIGN4PSIzNC40OTUzIiBjeT0iMzQuNDk1MyIgcj0iMzQuNDk1MyIgdHJhbnNmb3JtPSJtYXRyaXgoLTEgMCAwIDEgMjA3LjAxOCAyNTQuMTIpIiBmaWxsPSIjRkY2NjBBIi8+CjxwYXRoIGQ9Ik0xNTQuMzE4IDMxNy45NTVDMTcxLjI3MyAzMTAuODkgMTc2LjU4MiAyOTAuNzE1IDE3Ni4xNTcgMjgzLjQ4N0wyMDcuMDE4IDI4OC44NjRDMjA3LjAxOCAzMDMuMzE0IDIwMC4yMTIgMzA5LjQwMiAxOTcuODI0IDMxMi40MzNDMTkzLjQ3NCAzMTcuOTU1IDE3My4zNTEgMzMwLjAzIDE1NC4zMTggMzE3Ljk1NVoiIGZpbGw9InVybCgjcGFpbnQxX3JhZGlhbF8zXzE1MSkiLz4KPGcgZmlsdGVyPSJ1cmwoI2ZpbHRlcjBfZF8zXzE1MSkiPgo8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTIyNy4zNzcgMzAyLjI3NkMyMjYuNDI2IDMwNS44OTcgMjMwLjMxNSAzMDkuNDA1IDIzMy4zOTYgMzA3LjI3OUMyNTQuNTM4IDI5Mi42ODQgMjcwLjQ3OSAyNjkuOTQ1IDI3NC44OSAyNDcuNDg5QzI4Mi4yNCAyMTAuMDcxIDI3Mi4yMzUgMTc1LjcyNyAyMzguMDI4IDE0NS45MjVDMjAwLjg3NCAxMTMuNTU2IDE5MS44NDQgODguNDU2MSAxOTAuMTYyIDUwLjg3MThDMTg5Ljc5NyA0Mi43MjE4IDE4MS42MDQgMzcuMjk0NyAxNzQuODI0IDQxLjgzMTdDMTUyLjY2OCA1Ni42NTc0IDEzMi41MTIgODQuNDk5IDEzOC45MTEgMTIwLjc1OEMxNDEuMDA0IDEzMi42MjEgMTQ2Ljc5NCAxNDEuMDE2IDE1MS45NyAxNDguNTIzQzE1OC40OTEgMTU3Ljk3OCAxNjQuMDM5IDE2Ni4wMjMgMTU5Ljk5NyAxNzcuODFDMTU1LjIwMyAxOTEuNzk0IDEzOS4xMzQgMTk5LjE2MiAxMjguNzQ3IDE5Mi40MjlDMTE0LjE3IDE4Mi45ODEgMTEzLjI1MyAxNjYuNjUxIDExNy45NjkgMTQ5LjQ1NkMxMTguOTAyIDE0Ni4wNTUgMTE1LjQ3MSAxNDMuMjA0IDExMi42OCAxNDUuMzU5QzkxLjM2MDQgMTYxLjgyMSA2OS4xNTMyIDE5OS4yNjcgNzcuNjY0NyAyNDcuNDg5Qzg1Ljk3OTIgMjc2LjIxMiA5Ny45Mjc3IDI5Mi41MzcgMTEwLjk3MSAzMDEuNTQxQzExMy43NjMgMzAzLjQ2OCAxMTcuMTU5IDMwMC42MzEgMTE2LjU5NyAyOTcuMjg2QzExNi4wODEgMjk0LjIxMiAxMTUuODEzIDI5MS4wNTQgMTE1LjgxMyAyODcuODMzQzExNS44MTMgMjU2LjUxMyAxNDEuMjAzIDIzMS4xMjMgMTcyLjUyMyAyMzEuMTIzQzIwMy44NDIgMjMxLjEyMyAyMjkuMjMyIDI1Ni41MTMgMjI5LjIzMiAyODcuODMzQzIyOS4yMzIgMjkyLjgyNCAyMjguNTg3IDI5Ny42NjUgMjI3LjM3NyAzMDIuMjc2WiIgZmlsbD0idXJsKCNwYWludDJfbGluZWFyXzNfMTUxKSIvPgo8L2c+CjxkZWZzPgo8ZmlsdGVyIGlkPSJmaWx0ZXIwX2RfM18xNTEiIHg9IjcyLjExMTIiIHk9IjM2LjQ5NCIgd2lkdGg9IjIwOC43NDIiIGhlaWdodD0iMjc1LjEyIiBmaWx0ZXJVbml0cz0idXNlclNwYWNlT25Vc2UiIGNvbG9yLWludGVycG9sYXRpb24tZmlsdGVycz0ic1JHQiI+CjxmZUZsb29kIGZsb29kLW9wYWNpdHk9IjAiIHJlc3VsdD0iQmFja2dyb3VuZEltYWdlRml4Ii8+CjxmZUNvbG9yTWF0cml4IGluPSJTb3VyY2VBbHBoYSIgdHlwZT0ibWF0cml4IiB2YWx1ZXM9IjAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDEyNyAwIiByZXN1bHQ9ImhhcmRBbHBoYSIvPgo8ZmVPZmZzZXQvPgo8ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIxLjg0NTA2Ii8+CjxmZUNvbXBvc2l0ZSBpbjI9ImhhcmRBbHBoYSIgb3BlcmF0b3I9Im91dCIvPgo8ZmVDb2xvck1hdHJpeCB0eXBlPSJtYXRyaXgiIHZhbHVlcz0iMCAwIDAgMCAxIDAgMCAwIDAgMC40MiAwIDAgMCAwIDAgMCAwIDAgMC43IDAiLz4KPGZlQmxlbmQgbW9kZT0ibXVsdGlwbHkiIGluMj0iQmFja2dyb3VuZEltYWdlRml4IiByZXN1bHQ9ImVmZmVjdDFfZHJvcFNoYWRvd18zXzE1MSIvPgo8ZmVCbGVuZCBtb2RlPSJub3JtYWwiIGluPSJTb3VyY2VHcmFwaGljIiBpbjI9ImVmZmVjdDFfZHJvcFNoYWRvd18zXzE1MSIgcmVzdWx0PSJzaGFwZSIvPgo8L2ZpbHRlcj4KPGxpbmVhckdyYWRpZW50IGlkPSJwYWludDBfbGluZWFyXzNfMTUxIiB4MT0iMTc2LjQxMyIgeTE9IjAuMzE3MTM5IiB4Mj0iMTc2LjQxMyIgeTI9IjM1MS43MTEiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4KPHN0b3Agc3RvcC1jb2xvcj0iI0ZGRjI3OSIvPgo8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNGRkQzMzYiLz4KPC9saW5lYXJHcmFkaWVudD4KPHJhZGlhbEdyYWRpZW50IGlkPSJwYWludDFfcmFkaWFsXzNfMTUxIiBjeD0iMCIgY3k9IjAiIHI9IjEiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIiBncmFkaWVudFRyYW5zZm9ybT0idHJhbnNsYXRlKDIxOC4wNDggMjQ5LjM0Nykgcm90YXRlKDEyNC4wMTgpIHNjYWxlKDg5LjI5NTUgMjY0LjgwOSkiPgo8c3RvcCBvZmZzZXQ9IjAuNjQwODUiIHN0b3AtY29sb3I9IiNGRjY2MEEiLz4KPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjRkZCRTE1Ii8+CjwvcmFkaWFsR3JhZGllbnQ+CjxsaW5lYXJHcmFkaWVudCBpZD0icGFpbnQyX2xpbmVhcl8zXzE1MSIgeDE9IjE3Ni40ODIiIHkxPSI0MC4xODQxIiB4Mj0iMTc2LjQ4MiIgeTI9IjMxNy4yNzgiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4KPHN0b3Agb2Zmc2V0PSIwLjMzODU0MiIgc3RvcC1jb2xvcj0iI0ZGOEYzRiIvPgo8c3RvcCBvZmZzZXQ9IjAuNjU2MjUiIHN0b3AtY29sb3I9IiNGRjcwMjAiLz4KPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjRkYzRDAwIi8+CjwvbGluZWFyR3JhZGllbnQ+CjwvZGVmcz4KPC9zdmc+Cg==";

/**
 * Wagmi config for burner wallet
 */
export const burnerWalletConfig = (): Wallet => ({
  id: burnerWalletId,
  name: burnerWalletName,
  iconUrl: burnerWalletIconBase64,
  iconBackground: "#ffffff",
  createConnector: () => {
    return createBurnerConnector();
  },
});

// --------------------------------------------------------------------

const RAINBOW_TERMS = "https://rainbow.me/terms-of-use";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID";

const { wallets } = getDefaultWallets();

const avalanche = {
  id: 43_114,
  name: "Avalanche",
  iconUrl: "https://s2.coinmarketcap.com/static/img/coins/64x64/5805.png",
  iconBackground: "#fff",
  nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://api.avax.network/ext/bc/C/rpc"] },
  },
  blockExplorers: {
    default: { name: "SnowTrace", url: "https://snowtrace.io" },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 11_907_934,
    },
  },
} as const satisfies Chain;

const config = getDefaultConfig({
  appName: "RainbowKit Demo",
  projectId,
  chains: [
    mainnet,
    polygon,
    optimism,
    arbitrum,
    base,
    bsc,
    avalanche,
    zora,
    blast,
    zkSync,
    ronin,
    ...(process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true"
      ? [
          sepolia,
          holesky,
          polygonMumbai,
          optimismSepolia,
          arbitrumSepolia,
          baseSepolia,
          zoraSepolia,
          blastSepolia,
          avalancheFuji,
        ]
      : []),
  ],
  wallets: [
    {
      groupName: "Other",
      wallets: [burnerWalletConfig],
    },
  ],
  ssr: true,
});

const demoAppInfo = {
  appName: "Rainbowkit Demo",
};

const DisclaimerDemo: DisclaimerComponent = ({ Link, Text }) => {
  return (
    <Text>
      By connecting, you agree to this demo&apos;s{" "}
      <Link href={RAINBOW_TERMS}>Terms of Service</Link> and acknowledge you
      have read and understand our <Link href={RAINBOW_TERMS}>Disclaimer</Link>
    </Text>
  );
};

const CustomAvatar: AvatarComponent = ({ size }) => {
  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: "lightpink",
        color: "black",
        display: "flex",
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      :^)
    </div>
  );
};

const getSiweMessageOptions: GetSiweMessageOptions = () => ({
  statement: "Sign in to the RainbowKit Demo",
});

const themes = [
  { name: "light", theme: lightTheme },
  { name: "dark", theme: darkTheme },
  { name: "midnight", theme: midnightTheme },
] as const;
type ThemeName = (typeof themes)[number]["name"];

const fontStacks = ["rounded", "system"] as const;
type FontStack = (typeof fontStacks)[number];

const accentColors = [
  "blue",
  "green",
  "orange",
  "pink",
  "purple",
  "red",
  "custom",
] as const;
type AccentColor = (typeof accentColors)[number];

const radiusScales = ["large", "medium", "small", "none"] as const;
type RadiusScale = (typeof radiusScales)[number];

const overlayBlurs = ["large", "small", "none"] as const;
type OverlayBlur = (typeof overlayBlurs)[number];

const modalSizes = ["wide", "compact"] as const;
type ModalSize = (typeof modalSizes)[number];

function RainbowKitApp({
  Component,
  pageProps,
}: AppProps<{
  session: Session;
}>) {
  const router = useRouter();

  const { disconnect } = useDisconnect();
  const [selectedInitialChainId, setInitialChainId] = useState<number>();
  const [selectedThemeName, setThemeName] = useState<ThemeName>("light");
  const [selectedFontStack, setFontStack] = useState<FontStack>("rounded");
  const [selectedAccentColor, setAccentColor] = useState<AccentColor>("blue");
  const [selectedRadiusScale, setRadiusScale] = useState<RadiusScale>("large");
  const [selectedOverlayBlur, setOverlayBlur] = useState<OverlayBlur>("none");
  const [authEnabled, setAuthEnabled] = useState(pageProps.session !== null);
  const [showRecentTransactions, setShowRecentTransactions] = useState(true);
  const [coolModeEnabled, setCoolModeEnabled] = useState(false);
  const [modalSize, setModalSize] = useState<ModalSize>("wide");
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [customAvatar, setCustomAvatar] = useState(false);

  const routerLocale = router.locale as Locale;

  // Set `locale` as default from next.js and let dropdown set new `locale`
  const [locale, setLocale] = useState<Locale>(routerLocale);

  const currentTheme = (
    themes.find(({ name }) => name === selectedThemeName) ?? themes[0]
  ).theme;

  const backgroundStyles = {
    dark: { background: "#090913", color: "#FFF" },
    light: null,
    midnight: { background: "#0B0E17", color: "#FFF" },
  };

  const selectedBackgroundStyles = backgroundStyles[selectedThemeName];

  const accentColor =
    selectedAccentColor === "custom"
      ? { accentColor: "red", accentColorForeground: "yellow" } // https://blog.codinghorror.com/a-tribute-to-the-windows-31-hot-dog-stand-color-scheme
      : currentTheme.accentColors[selectedAccentColor];

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const appContextProps: AppContextProps = { authEnabled };

  const locales = router.locales as Locale[];

  // Note: Non-RainbowKit providers are wrapped around this component
  // at the bottom of the file. This is so that our example app
  // component can use their corresponding Hooks.
  return (
    <RainbowKitSiweNextAuthProvider
      enabled={authEnabled}
      getSiweMessageOptions={getSiweMessageOptions}
    >
      <RainbowKitProvider
        appInfo={{
          ...demoAppInfo,
          ...(showDisclaimer && { disclaimer: DisclaimerDemo }),
        }}
        avatar={customAvatar ? CustomAvatar : undefined}
        locale={locale}
        coolMode={coolModeEnabled}
        initialChain={selectedInitialChainId}
        modalSize={modalSize}
        showRecentTransactions={showRecentTransactions}
        theme={currentTheme({
          ...accentColor,
          borderRadius: selectedRadiusScale,
          fontStack: selectedFontStack,
          overlayBlur: selectedOverlayBlur,
        })}
      >
        <div
          style={{
            minHeight: "100vh",
            padding: 8,
            ...selectedBackgroundStyles,
          }}
        >
          <Component {...pageProps} {...appContextProps} />

          {isMounted && (
            <>
              <div
                style={{
                  fontFamily: "sans-serif",
                }}
              >
                <h3>RainbowKitProvider props</h3>
                <table cellSpacing={12}>
                  <tbody>
                    <tr>
                      <td>
                        <label
                          htmlFor="authEnabled"
                          style={{ userSelect: "none" }}
                        >
                          authentication
                        </label>
                      </td>
                      <td>
                        <input
                          checked={authEnabled}
                          id="authEnabled"
                          name="authEnabled"
                          onChange={(e) => {
                            setAuthEnabled(e.target.checked);

                            // Reset connection and auth state when
                            // toggling the authentication mode.
                            // This better simulates the real dev experience
                            // since they don't normally toggle between
                            // these two modes at run time. Otherwise you
                            // might experience weird behavior when toggling
                            // in the middle of a session.
                            signOut({ redirect: false });
                            disconnect();
                          }}
                          type="checkbox"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <label
                          htmlFor="showRecentTransactions"
                          style={{ userSelect: "none" }}
                        >
                          showRecentTransactions
                        </label>
                      </td>
                      <td>
                        <input
                          checked={showRecentTransactions}
                          id="showRecentTransactions"
                          name="showRecentTransactions"
                          onChange={(e) =>
                            setShowRecentTransactions(e.target.checked)
                          }
                          type="checkbox"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <label
                          htmlFor="coolModeEnabled"
                          style={{ userSelect: "none" }}
                        >
                          coolMode
                        </label>
                      </td>
                      <td>
                        <input
                          checked={coolModeEnabled}
                          id="coolModeEnabled"
                          name="coolModeEnabled"
                          onChange={(e) => setCoolModeEnabled(e.target.checked)}
                          type="checkbox"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <label
                          htmlFor="showDisclaimer"
                          style={{ userSelect: "none" }}
                        >
                          disclaimer
                        </label>
                      </td>
                      <td>
                        <input
                          checked={showDisclaimer}
                          id="showDisclaimer"
                          name="showDisclaimer"
                          onChange={(e) => setShowDisclaimer(e.target.checked)}
                          type="checkbox"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <label
                          htmlFor="customAvatar"
                          style={{ userSelect: "none" }}
                        >
                          avatar
                        </label>
                      </td>
                      <td>
                        <input
                          checked={customAvatar}
                          id="customAvatar"
                          name="customAvatar"
                          onChange={(e) => setCustomAvatar(e.target.checked)}
                          type="checkbox"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td>modalSize</td>
                      <td>
                        <select
                          onChange={(e) =>
                            setModalSize(e.target.value as ModalSize)
                          }
                          value={modalSize}
                        >
                          {modalSizes.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td>initialChain</td>
                      <td>
                        <select
                          onChange={(e) =>
                            setInitialChainId(
                              e.target.value
                                ? parseInt(e.target.value, 10)
                                : undefined,
                            )
                          }
                          value={selectedInitialChainId ?? "default"}
                        >
                          {[undefined, ...config.chains].map((chain) => (
                            <option
                              key={chain?.id ?? ""}
                              value={chain?.id ?? ""}
                            >
                              {chain?.name ?? "Default"}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <label style={{ userSelect: "none" }}>locale</label>
                      </td>
                      <td>
                        <select
                          onChange={(e) => {
                            setLocale(e.target.value as Locale);
                          }}
                          value={locale}
                        >
                          {locales.map((locale) => (
                            <option key={locale} value={locale}>
                              {locale}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 24,
                  }}
                >
                  <div>
                    <h4>Theme</h4>
                    <div
                      style={{
                        alignItems: "flex-start",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      {themes.map(({ name: themeName }) => (
                        <label key={themeName} style={{ userSelect: "none" }}>
                          <input
                            checked={themeName === selectedThemeName}
                            name="theme"
                            onChange={(e) =>
                              setThemeName(e.target.value as ThemeName)
                            }
                            type="radio"
                            value={themeName}
                          />{" "}
                          {themeName}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4>Font stack</h4>
                    <div
                      style={{
                        alignItems: "flex-start",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      {fontStacks.map((fontStack) => (
                        <label key={fontStack} style={{ userSelect: "none" }}>
                          <input
                            checked={fontStack === selectedFontStack}
                            name="fontStack"
                            onChange={(e) =>
                              setFontStack(e.target.value as FontStack)
                            }
                            type="radio"
                            value={fontStack}
                          />{" "}
                          {fontStack}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4>Accent</h4>
                    <div
                      style={{
                        alignItems: "flex-start",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      {accentColors.map((accentColor) => (
                        <label key={accentColor} style={{ userSelect: "none" }}>
                          <input
                            checked={accentColor === selectedAccentColor}
                            name="accentColor"
                            onChange={(e) =>
                              setAccentColor(e.target.value as AccentColor)
                            }
                            type="radio"
                            value={accentColor}
                          />{" "}
                          {accentColor}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4>Border radius</h4>
                    <div
                      style={{
                        alignItems: "flex-start",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      {radiusScales.map((radiusScale) => (
                        <label key={radiusScale} style={{ userSelect: "none" }}>
                          <input
                            checked={radiusScale === selectedRadiusScale}
                            name="radiusScale"
                            onChange={(e) =>
                              setRadiusScale(e.target.value as RadiusScale)
                            }
                            type="radio"
                            value={radiusScale}
                          />{" "}
                          {radiusScale}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4>Overlay blurs</h4>
                    <div
                      style={{
                        alignItems: "flex-start",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      {overlayBlurs.map((overlayBlur) => (
                        <label key={overlayBlur} style={{ userSelect: "none" }}>
                          <input
                            checked={overlayBlur === selectedOverlayBlur}
                            name="overlayBlur"
                            onChange={(e) =>
                              setOverlayBlur(e.target.value as OverlayBlur)
                            }
                            type="radio"
                            value={overlayBlur}
                          />{" "}
                          {overlayBlur}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </RainbowKitProvider>
    </RainbowKitSiweNextAuthProvider>
  );
}

const queryClient = new QueryClient();

export default function App(
  appProps: AppProps<{
    session: Session;
  }>,
) {
  return (
    <>
      <Head>
        <title>RainbowKit Example</title>
        <link href="/favicon.ico" rel="icon" />
      </Head>

      <SessionProvider refetchInterval={0} session={appProps.pageProps.session}>
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitApp {...appProps} />
          </QueryClientProvider>
        </WagmiProvider>
      </SessionProvider>
    </>
  );
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from "react-router-dom";
import { Buffer } from 'buffer';
import { WalletProvider, ConnectionProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

window.Buffer = Buffer;
const endpoint = "https://api.devnet.solana.com";

createRoot(document.getElementById('root')).render(
  <ConnectionProvider endpoint={endpoint}>
    <WalletProvider wallets={[new PhantomWalletAdapter()]}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </WalletProvider>
  </ConnectionProvider>
)

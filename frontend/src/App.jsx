import { useState } from 'react'
import './App.css'
import { Route, Routes, useNavigate } from "react-router-dom";

import SwapPage from './pages/SwapPage';
import LiquidityPage from './pages/LiquidityPage';
import CreatePoolPage from './pages/CreatePoolPage';

function App() {
  const navigate = useNavigate();

  const swapClick = () => { navigate('/swap') };
  const liquidityClick = () => { navigate('/liquidity') };
  const createPoolClick = () => { navigate('/createPool') };
  const homeClick = () => { navigate('/') };

  // Wallet connection function
  const [walletAddress, setWalletAddress] = useState(null);
  const connectWallet = async () => {
    if (window.solana && window.solana.isPhantom) {
      try {
        // Request wallet connection
        const response = await window.solana.connect();
        setWalletAddress(response.publicKey.toString());
        console.log("Connected with Public Key:", response.publicKey.toString());
      } catch (err) {
        console.error("Wallet connection error:", err);
      }
    } else {
      alert("Phantom wallet not found! Please install.");
    }
  };

  return (
    <div className='App'>
      {/* Connect Wallet Button */}
      <div className="wallet-button-container">
        {walletAddress ? (
          <p>Phantom Wallet Connected: {walletAddress}</p>
        ) : (
          <button onClick={connectWallet} className="button">Connect Phantom Wallet</button>
        )}
      </div>

      {location.pathname === '/' && (
        // Only show this part if we're on the homepage ("/")
        <header className='Title'>
          <h1>Solana Automated Market Maker</h1>
        </header>
      )}

      {location.pathname === '/' && (
        // Only show the buttons on the homepage
        <div className='Homepage buttons'>
          <button onClick={swapClick} className='button'>Swap Tokens</button>
          <button onClick={liquidityClick} className='button'>Add or Remove Liquidity</button>
          <button onClick={createPoolClick} className='button'>Create Liquidity Pool</button>
        </div>
      )}

      {location.pathname != '/' && (
        // sho on all pages except the homepage
        <div className="home-button-container">
          <button onClick={homeClick} className="button">Home</button>
        </div>
      )}

      <Routes>
        <Route path="/swap" element={<SwapPage />} />
        <Route path="/liquidity" element={<LiquidityPage />} />
        <Route path="/createPool" element={<CreatePoolPage />} />
      </Routes>
    </div>
  )
}

export default App

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

  return (
    <div className='App'>

      {location.pathname === '/' && (
        // Only show title on the homepage
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
        // show on all pages except the homepage
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

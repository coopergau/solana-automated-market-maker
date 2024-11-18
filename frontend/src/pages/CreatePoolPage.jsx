import React, { useState } from "react";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import idl from "../program_idl/amm.json";

const CreatePoolPage = () => {
    const [tokenAMint, setTokenAMint] = useState("");
    const [tokenBMint, setTokenBMint] = useState("");
    const [loading, setLoading] = useState(false);
    const [walletConnected, setConnected] = useState(false);

    const connectWallet = async () => {
        try {
            // Check if Phantom is installed
            const { solana } = window;

            if (!solana?.isPhantom) {
                alert('Please install Phantom wallet!');
                return;
            }

            // Connect to wallet
            const response = await solana.connect();
            console.log('Connected with Public Key:', response.publicKey.toString());
            setConnected(true);

        } catch (error) {
            console.error(error);
            alert('Error connecting to wallet');
        }
    };

    const initializePool = async () => {
        if (!walletConnected) {
            alert("Please connect your wallet");
            return;
        }

        try {
            setLoading(true);
            // Set up connection to Solana network
            const connection = new Connection("https://api.devnet.solana.com", "confirmed"); // make address a global var
            const programId = new PublicKey("6z3BNmWeBSkEmhFCXNHS2bGAWmhPxbB3Mw1DdXTNfgSK"); // make address a global var

            const provider = new AnchorProvider(
                connection,
                window.solana,
                AnchorProvider.defaultOptions()
            );

            const program = new Program(
                idl, // Program idl
                programId,
            );

            // Get accounts for accounts struct
            const tokenAMintAddress = new PublicKey(tokenAMint);
            const tokenBMintAddress = new PublicKey(tokenBMint);

            // PDAs for pool and lp token mint address
            const [poolAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from("pool"), tokenAMintAddress.toBuffer(), tokenBMintAddress.toBuffer()],
                programId
            );

            // Check to see if the pool with these two tokens already exists
            const poolInfo = await connection.getAccountInfo(poolAddress);

            if (poolInfo != null) {
                alert("Liquidity Pool already exists");
                return;
            }

            const [tokenLpMintAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from("mint"), poolAddress.toBuffer()],
                programId
            );

            // Create the transaction
            const payer = new PublicKey(window.solana.publicKey);
            const tx = await program.methods
                .initializePool()
                .accounts({
                    pool: poolAddress,
                    tokenLpMint: tokenLpMintAddress,
                    tokenAMint: tokenAMintAddress,
                    tokenBMint: tokenBMintAddress,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    user: payer,
                    systemProgram: SystemProgram.programId,
                })
                .transaction();

            // Get latest blockhash
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            tx.lastValidBlockHeight = lastValidBlockHeight;
            tx.feePayer = provider.wallet.publicKey;

            console.log("Sending transaction...");

            // Sign and send transaction
            const signature = await window.solana.signAndSendTransaction(tx);
            console.log("Transaction sent:", signature);

            // Wait for confirmation
            const latestBlockHash = await connection.getLatestBlockhash();
            await connection.confirmTransaction({
                blockhash: latestBlockHash.blockhash,
                lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
                signature: signature.signature,
            });
            console.log("Transaction confirmed!");
            alert(`Transaction confirmed, pool address is: ${poolAddress}. Please initialize pool reserves.`);
        } catch (error) {
            console.error("Error initializing pool:", error);
            alert(`Failed to initialize pool: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const initializePoolReserves = async () => {
        if (!walletConnected) {
            alert("Please connect your wallet");
            return;
        }

        try {
            setLoading(true);
            // Set up connection to Solana network
            const connection = new Connection("https://api.devnet.solana.com", "confirmed"); // make address a global var
            const programId = new PublicKey("6z3BNmWeBSkEmhFCXNHS2bGAWmhPxbB3Mw1DdXTNfgSK"); // make address a global var

            const provider = new AnchorProvider(
                connection,
                window.solana,
                AnchorProvider.defaultOptions()
            );

            const program = new Program(
                idl, // Program idl
                programId,
            );

            // Get accounts for accounts struct
            const tokenAMintAddress = new PublicKey(tokenAMint);
            const tokenBMintAddress = new PublicKey(tokenBMint);

            // PDAs for pool and lp token mint address
            const [poolAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from("pool"), tokenAMintAddress.toBuffer(), tokenBMintAddress.toBuffer()],
                programId
            );

            const [tokenAReservePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("reserves"), tokenAMintAddress.toBuffer(), poolAddress.toBuffer()],
                programId
            );

            const [tokenBReservePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("reserves"), tokenBMintAddress.toBuffer(), poolAddress.toBuffer()],
                programId
            );

            // Create the transaction
            const payer = new PublicKey(window.solana.publicKey);
            const tx = await program.methods
                .initializePoolReserves()
                .accounts({
                    tokenAReserves: tokenAReservePda,
                    tokenBReserves: tokenBReservePda,
                    pool: poolAddress,
                    tokenAMint: tokenAMintAddress,
                    tokenBMint: tokenBMintAddress,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    user: payer,
                    systemProgram: SystemProgram.programId,
                })
                .transaction();

            // Get latest blockhash
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            tx.lastValidBlockHeight = lastValidBlockHeight;
            tx.feePayer = provider.wallet.publicKey;

            console.log("Sending transaction...");

            // Sign and send transaction
            const signature = await window.solana.signAndSendTransaction(tx);
            console.log("Transaction sent:", signature);

            // Wait for confirmation
            const latestBlockHash = await connection.getLatestBlockhash();
            await connection.confirmTransaction({
                blockhash: latestBlockHash.blockhash,
                lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
                signature: signature.signature,
            });
            console.log("Transaction confirmed!");
            alert(`Transaction confirmed, pool reserves initialized. Pool address is ${poolAddress}`);

        } catch (error) {
            console.error("Error initializing pool reserves:", error);
            alert(`Failed to initialize pool reserves: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1>Create Liquidity Pool</h1>
            <button onClick={connectWallet}>
                {walletConnected ? 'Connected' : 'Connect to Phantom'}
            </button>
            <div>
                <label>Token A Mint Address:</label>
                <input
                    type="text"
                    value={tokenAMint}
                    onChange={(e) => setTokenAMint(e.target.value)}
                />
            </div>
            <div>
                <label>Token B Mint Address:</label>
                <input
                    type="text"
                    value={tokenBMint}
                    onChange={(e) => setTokenBMint(e.target.value)}
                />
            </div>
            <button onClick={initializePool} className="button">
                {loading ? "Initializing Pool..." : "Initialize Pool"}
            </button>
            <button onClick={initializePoolReserves} className="button">
                {loading ? "Initializing Pool Reserves..." : "Initialize Pool Reserves"}
            </button>
        </div>
    );
};


export default CreatePoolPage;

import React, { useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import idl from "../program_idl/amm.json";

const CreatePoolPage = () => {
    const [pool, setPoolAddress] = useState("");
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

    const addLiquidity = async () => {
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

            // Get liquidity pool account info to get associated account address
            const poolAddress = new PublicKey("DhXihCmCoYtbZxFG9UesUGhVz51mRPuj6wu4HFmLnFno");
            const poolInfo = await connection.getAccountInfo(poolAddress);

            if (poolInfo === null) {
                alert("Liquidity Pool does not exist");
                return;
            }

            // Deserialize the data into account addresses
            // This is based on the pool account struct in the program rust code
            const poolData = poolInfo.data;
            const token_a_mint = new PublicKey(poolData.subarray(0, 32));
            const token_b_mint = new PublicKey(poolData.subarray(32, 64));
            const token_a_reserves = new PublicKey(poolData.subarray(64, 96));
            const token_b_reserves = new PublicKey(poolData.subarray(96, 128));
            const token_lp_mint = new PublicKey(poolData.subarray(128, 160));
            console.log(token_a_mint);
            console.log(token_b_mint);
            console.log(token_a_reserves);
            console.log(token_b_reserves);
            console.log(token_lp_mint);

            const LPMintAddress = poolInfo.token_lp_mint;

            const payer = new PublicKey(window.solana.publicKey);
            const tx = await program.methods
                .initializePool()
                .accounts({
                    pool: poolAddress,
                    tokenLpMint: LPMintPda,
                    tokenAMint: tokenAMintPda,
                    tokenBMint: tokenBMintPda,
                    tokenAReserves: tokenAReservePda,
                    tokenBReserves: tokenBReservePda,
                    user: payer.publicKey,
                    userTokenA: userTokenAAccount.address,
                    userTokenB: userTokenBAccount.address,
                    userTokenLp: userTokenLPAccount.address,
                    token_program: TOKEN_PROGRAM_ID,
                    system_program: SystemProgram.programId,
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
            alert(`Transaction confirmed, pool address is: ${poolAddress}`);
        } catch (error) {
            console.error("Error Adding Liquidity:", error);
            alert(`Failed to add liquidity: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1>Add or Remove Liquidity</h1>
            <button onClick={connectWallet}>
                {walletConnected ? 'Connected' : 'Connect to Phantom'}
            </button>
            <div>
                <label>Liquidity Pool Address:</label>
                <input
                    type="text"
                    value={pool}
                    onChange={(e) => setPoolAddress(e.target.value)}
                />
            </div>
            <button onClick={addLiquidity} className="button">
                {loading ? "Adding Liquidity..." : "Add Liquidity"}
            </button>
        </div>
    );
};


export default CreatePoolPage;

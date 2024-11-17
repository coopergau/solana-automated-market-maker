import React, { useState } from "react";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import idl from "/root/solana/amm/target/idl/amm.json";

const CreatePoolPage = () => {
    const [tokenAMint, setTokenAMint] = useState("");
    const [tokenBMint, setTokenBMint] = useState("");
    const [loading, setLoading] = useState(false);

    const wallet = window.solana;

    const initializePool = async () => {
        if (!wallet) {
            alert("Please connect your wallet");
            return;
        }

        try {
            setLoading(true);
            // Set up connection to Solana network
            const connection = new Connection("https://api.devnet.solana.com", "confirmed"); // make address a global var
            const programId = new PublicKey("4aYmUZwssmfkaN6igxi4Sgy3toi3D1dNGwJdwtGCWcjk");

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
            const accountInfo = await connection.getAccountInfo(poolAddress);

            if (accountInfo != null) {
                alert("Liquidity Pool already exists");
                return;
            }

            const [tokenLpMintAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from("mint"), poolAddress.toBuffer()],
                programId
            );

            const payer = new PublicKey(wallet.publicKey);
            const payerBalance = await connection.getBalance(payer);
            console.log(payerBalance);
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
            console.log(tx.recentBlockhash);
            console.log(tx.lastValidBlockHeight);

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

        } catch (error) {
            console.error("Error initializing pool:", error);
            alert(`Failed to initialize pool: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1>Create Liquidity Pool</h1>
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
        </div>
    );
};


export default CreatePoolPage;

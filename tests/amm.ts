import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { assert } from "chai";

describe("amm", () => {
  // Global variables
  let connection: anchor.web3.Connection;
  let program: anchor.Program<Amm>;
  let ammId: anchor.web3.PublicKey; // Is this actually needed
  let payer: anchor.web3.Keypair;

  // Global variables of example tokens A and B
  let tokenAMintPda: anchor.web3.PublicKey;
  let tokenBMintPda: anchor.web3.PublicKey;
  let tokenAReservePda: anchor.web3.PublicKey;
  let tokenBReservePda: anchor.web3.PublicKey;
  let mintAuthorityA: anchor.web3.Keypair;
  let mintAuthorityB: anchor.web3.Keypair;
  let poolPda: anchor.web3.PublicKey;

  before(async () => {
    // Set up anchor to connect to the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    connection = provider.connection;

    // Set the AMM program ID
    program = anchor.workspace.Amm as Program<Amm>;
    ammId = program.programId;

    // Create and fund a payer
    payer = Keypair.generate();
    const amountofSol = 100;
    const airdropSig = await connection.requestAirdrop(payer.publicKey, amountofSol * LAMPORTS_PER_SOL);
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSig,
    });

    // Create example SPL tokens
    mintAuthorityA = Keypair.generate();
    mintAuthorityB = Keypair.generate();
    const freezeAutorityA = Keypair.generate();
    const freezeAutorityB = Keypair.generate();
    const tokenAKeypair = Keypair.generate();
    const tokenBKeypair = Keypair.generate();
    const decimals = 9;

    // Derive PDA for example liquidity pool
    tokenAMintPda = await createMint(connection, payer, mintAuthorityA.publicKey, freezeAutorityA.publicKey, decimals, tokenAKeypair);
    tokenBMintPda = await createMint(connection, payer, mintAuthorityB.publicKey, freezeAutorityB.publicKey, decimals, tokenBKeypair);
    [poolPda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), tokenAMintPda.toBuffer(), tokenBMintPda.toBuffer()],
      ammId
    );

    [tokenAReservePda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reserves"), tokenAMintPda.toBuffer(), poolPda.toBuffer()],
      ammId
    );
    [tokenBReservePda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reserves"), tokenBMintPda.toBuffer(), poolPda.toBuffer()],
      ammId
    );
  })

  it("pool is initialzed", async () => {
    const accounts = {
      pool: poolPda,
      tokenAMint: tokenAMintPda,
      tokenBMint: tokenBMintPda,
      token_program: TOKEN_PROGRAM_ID,
      user: payer.publicKey,
      system_program: SystemProgram.programId,
    };

    try {
      const tx = await program.methods.initializePool()
        .accounts(accounts)
        .signers([payer])
        .rpc();
    } catch (error) {
      console.error("Failed to initialize pool:", error);
    }
  });

  it("Pool reserves are initialized", async () => {

    const accounts = {
      tokenAReserves: tokenAReservePda,
      tokenBReserves: tokenBReservePda,
      pool: poolPda,
      tokenAMint: tokenAMintPda,
      tokenBMint: tokenBMintPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      user: payer.publicKey,
      systemProgram: SystemProgram.programId,
    }

    try {
      const tx = await program.methods.initializePoolReserves()
        .accounts(accounts)
        .signers([payer])
        .rpc();
    } catch (error) {
      console.error("Failed to initialize pool reserves:", error);
    }
  });

  it("Add liguidity function changes account balances correctly", async () => {
    // Create token accounts for payer
    const userTokenAAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      tokenAMintPda,
      payer.publicKey
    );
    const userTokenBAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      tokenBMintPda,
      payer.publicKey
    );

    // Mint the tokens to the user accounts
    const tokenAMintAmount = 10;
    const tokenBMintAmount = 10;
    await mintTo(
      connection,
      payer,
      tokenAMintPda,
      userTokenAAccount.address,
      mintAuthorityA,
      tokenAMintAmount * 10 ** 9
    )

    await mintTo(
      connection,
      payer,
      tokenBMintPda,
      userTokenBAccount.address,
      mintAuthorityB,
      tokenBMintAmount * 10 ** 9
    )

    // Get the initial balances of the user token accounts and the liquidity pool token accounts
    const initialUserTokenAInfo = await getAccount(connection, userTokenAAccount.address);
    const initialUserTokenABalance = initialUserTokenAInfo.amount;
    const initialUserTokenBInfo = await getAccount(connection, userTokenBAccount.address);
    const initialUserTokenBBalance = initialUserTokenBInfo.amount;

    const initialPoolTokenAInfo = await getAccount(connection, tokenAReservePda);
    const initialPoolTokenABalance = initialPoolTokenAInfo.amount;
    const initialPoolTokenBInfo = await getAccount(connection, tokenBReservePda);
    const initialPoolTokenBBalance = initialPoolTokenBInfo.amount;

    // Transaction accounts
    const accounts = {
      pool: poolPda,
      tokenAMint: tokenAMintPda,
      tokenBMint: tokenBMintPda,
      tokenAReserves: tokenAReservePda,
      tokenBReserves: tokenBReservePda,
      user: payer.publicKey,
      userTokenA: userTokenAAccount.address,
      userTokenB: userTokenBAccount.address,
      token_program: TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    };
    const amountA = new anchor.BN(1 * 10 ** 9);
    const amountB = new anchor.BN(1 * 10 ** 9);

    // User adds liquidity to the pool
    try {
      const tx = await program.methods.addLiquidity(amountA, amountB)
        .accounts(accounts)
        .signers([payer])
        .rpc()
    } catch (error) {
      console.error("failed to add liquidity:", error)
    }

    // Get the final balances of the user token accounts and the liquidity pool token accounts
    const finalUserTokenAInfo = await getAccount(connection, userTokenAAccount.address);
    const finalUserTokenABalance = finalUserTokenAInfo.amount;
    const finalUserTokenBInfo = await getAccount(connection, userTokenBAccount.address);
    const finalUserTokenBBalance = finalUserTokenBInfo.amount;

    const finalPoolTokenAInfo = await getAccount(connection, tokenAReservePda);
    const finalPoolTokenABalance = finalPoolTokenAInfo.amount;
    const finalPoolTokenBInfo = await getAccount(connection, tokenBReservePda);
    const finalPoolTokenBBalance = finalPoolTokenBInfo.amount;

    // Get the change in all token account balances
    const userTokenADifference = finalUserTokenABalance - initialUserTokenABalance;
    const userTokenBDifference = finalUserTokenBBalance - initialUserTokenBBalance;

    const poolTokenADifference = finalPoolTokenABalance - initialPoolTokenABalance;
    const poolTokenBDifference = finalPoolTokenBBalance - initialPoolTokenBBalance;

    // Make sure all the changes are correct
    assert.equal((-userTokenADifference).toString(), amountA.toString(), "Difference in the user's token A balances is wrong.");
    assert.equal((-userTokenBDifference).toString(), amountB.toString(), "Difference in the user's token B balances is wrong.");
    assert.equal((poolTokenADifference).toString(), amountA.toString(), "Difference in the pool's token A balances is wrong.");
    assert.equal((poolTokenBDifference).toString(), amountB.toString(), "Difference in pool's token B balances is wrong.");
  });

  // it("Add liguidity function sends the right tokens to the right accounts", async () => {});
});

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { Account, TOKEN_PROGRAM_ID, createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { assert } from "chai";

describe("Liquidity Pool Functionality", () => {
  // Global variables
  let connection: anchor.web3.Connection;
  let program: anchor.Program<Amm>;
  let ammId: anchor.web3.PublicKey; // Is this actually needed
  let payer: anchor.web3.Keypair;

  // Global variables for example tokens A and B
  let tokenAMintPda: anchor.web3.PublicKey;
  let tokenBMintPda: anchor.web3.PublicKey;
  let tokenAReservePda: anchor.web3.PublicKey;
  let tokenBReservePda: anchor.web3.PublicKey;
  let mintAuthorityA: anchor.web3.Keypair;
  let mintAuthorityB: anchor.web3.Keypair;
  let poolPda: anchor.web3.PublicKey;

  // Global variables for an example payer
  let userTokenAAccount: Account;
  let userTokenBAccount: Account;
  const tokenAMintAmount = 10;
  const tokenBMintAmount = 10;

  before(async () => {
    // Set up anchor to connect to the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    connection = provider.connection;

    // Set the AMM program ID
    program = anchor.workspace.Amm as Program<Amm>;
    ammId = program.programId;

    // Create a payer and give them sol
    payer = Keypair.generate();
    const amountofSol = 100;
    const airdropSig = await connection.requestAirdrop(payer.publicKey, amountofSol * LAMPORTS_PER_SOL);
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSig,
    });

    // Create example SPL tokens A and B
    mintAuthorityA = Keypair.generate();
    mintAuthorityB = Keypair.generate();
    const freezeAutorityA = Keypair.generate();
    const freezeAutorityB = Keypair.generate();
    const tokenAKeypair = Keypair.generate();
    const tokenBKeypair = Keypair.generate();
    const decimals = 9;

    tokenAMintPda = await createMint(connection, payer, mintAuthorityA.publicKey, freezeAutorityA.publicKey, decimals, tokenAKeypair);
    tokenBMintPda = await createMint(connection, payer, mintAuthorityB.publicKey, freezeAutorityB.publicKey, decimals, tokenBKeypair);

    // Create the payer's token accounts for tokens A and B
    userTokenAAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      tokenAMintPda,
      payer.publicKey
    );
    userTokenBAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      tokenBMintPda,
      payer.publicKey
    );

    // Fund the payer's token accounts
    await mintTo(
      connection,
      payer,
      tokenAMintPda,
      userTokenAAccount.address,
      mintAuthorityA,
      tokenAMintAmount * 10 ** decimals
    );
    await mintTo(
      connection,
      payer,
      tokenBMintPda,
      userTokenBAccount.address,
      mintAuthorityB,
      tokenBMintAmount * 10 ** decimals
    );
  });

  it("Liquidity pool is initialzed", async () => {
    [poolPda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), tokenAMintPda.toBuffer(), tokenBMintPda.toBuffer()],
      ammId
    );

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

    // Check that the pool was actually created and it's owned by the program
    const poolAccountInfo = await connection.getAccountInfo(poolPda);
    assert.ok(poolAccountInfo !== null, "Pool account was not created");
    assert.equal(poolAccountInfo.owner.toString(), program.programId.toString(), "Pool account is not owned by the program")

    // Check that the initial pool state is correct
    const poolState = await program.account.pool.fetch(poolPda);
    assert.equal(poolState.tokenAMint.toString(), tokenAMintPda.toString(), "Pool token A mint address is wrong");
    assert.equal(poolState.tokenBMint.toString(), tokenBMintPda.toString(), "Pool token B mint address is wrong");

    const nullAddress = "11111111111111111111111111111111";
    assert.equal(poolState.tokenAReserves.toString(), nullAddress, "Pool token A reserve address should be zero");
    assert.equal(poolState.tokenAReserves.toString(), nullAddress, "Pool token B reserve address should be zero");
  });

  it("Pool reserves are initialized", async () => {
    [tokenAReservePda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reserves"), tokenAMintPda.toBuffer(), poolPda.toBuffer()],
      ammId
    );
    [tokenBReservePda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reserves"), tokenBMintPda.toBuffer(), poolPda.toBuffer()],
      ammId
    );

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

    // Check that the pool's token accounts are owned by the pool
    const poolAccountTokenA = await getAccount(connection, tokenAReservePda);
    const poolAccountTokenB = await getAccount(connection, tokenBReservePda);
    assert.equal(poolAccountTokenA.owner.toString(), poolPda.toString(), "Token A reserve account is not owned by the SPL program");
    assert.equal(poolAccountTokenB.owner.toString(), poolPda.toString(), "Token B reserve account is not owned by the SPL program");

    // Check that the pool's token accounts have initial balance of zero
    assert.equal(poolAccountTokenA.amount.toString(), "0", "Token A reserve account should have initial balance of zero");
    assert.equal(poolAccountTokenB.amount.toString(), "0", "Token B reserve account should have initial balance of zero");

    // Check that the pool state is updated correctly
    const poolState = await program.account.pool.fetch(poolPda);
    assert.equal(poolState.tokenAReserves.toString(), tokenAReservePda.toString(), "The pool's token A reserve account does not match expected address");
    assert.equal(poolState.tokenBReserves.toString(), tokenBReservePda.toString(), "The pool's token B reserve account does not match expected address");
  });

  it("Add liguidity function changes account balances correctly", async () => {
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
    assert.equal((poolTokenBDifference).toString(), amountB.toString(), "Difference in the pool's token B balances is wrong.");
  });

});

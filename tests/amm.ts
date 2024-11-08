import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { Account, TOKEN_PROGRAM_ID, createMint, getAccount, getMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { assert } from "chai";

describe("Liquidity Pool Functionality", () => {
  // Global variables
  let connection: anchor.web3.Connection;
  let program: anchor.Program<Amm>;
  let ammId: anchor.web3.PublicKey; // Is this actually needed

  // Global variables for example tokens A and B
  let tokenAMintPda: anchor.web3.PublicKey;
  let tokenBMintPda: anchor.web3.PublicKey;
  let tokenAReservePda: anchor.web3.PublicKey;
  let tokenBReservePda: anchor.web3.PublicKey;
  let mintAuthorityA: anchor.web3.Keypair;
  let mintAuthorityB: anchor.web3.Keypair;
  const decimals = 9;

  // Global variables for example liquidity pool
  let poolPda: anchor.web3.PublicKey;
  let LPMintPda: anchor.web3.PublicKey;

  // Global variables for an example payer
  let payer: anchor.web3.Keypair;
  let userTokenAAccount: Account;
  let userTokenBAccount: Account;
  let userTokenLPAccount: Account;
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
    // Get the PDAs for the liquidity pool and the pool's token mint account
    [poolPda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), tokenAMintPda.toBuffer(), tokenBMintPda.toBuffer()],
      ammId
    );

    [LPMintPda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint"), poolPda.toBuffer()],
      ammId
    );

    // Initialize a liquidity pool
    const accounts = {
      pool: poolPda,
      tokenLpMint: LPMintPda,
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

    // Check that the pool's token A and B mint addresses are stored correctly
    const poolState = await program.account.pool.fetch(poolPda);
    assert.equal(poolState.tokenAMint.toString(), tokenAMintPda.toString(), "Pool token A mint address is wrong");
    assert.equal(poolState.tokenBMint.toString(), tokenBMintPda.toString(), "Pool token B mint address is wrong");

    // Check that the pool's token accounts are the null address
    const nullAddress = "11111111111111111111111111111111";
    assert.equal(poolState.tokenAReserves.toString(), nullAddress, "Pool token A reserve address should be zero");
    assert.equal(poolState.tokenAReserves.toString(), nullAddress, "Pool token B reserve address should be zero");
  });

  it("Pool reserves are initialized", async () => {
    // Get the PDAs for the pool's token accounts
    [tokenAReservePda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reserves"), tokenAMintPda.toBuffer(), poolPda.toBuffer()],
      ammId
    );
    [tokenBReservePda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reserves"), tokenBMintPda.toBuffer(), poolPda.toBuffer()],
      ammId
    );

    // Create the pool's token acounts
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

    // Check that the pool token account addresses are updated correctly
    const poolState = await program.account.pool.fetch(poolPda);
    assert.equal(poolState.tokenAReserves.toString(), tokenAReservePda.toString(), "The pool's token A reserve account does not match expected address");
    assert.equal(poolState.tokenBReserves.toString(), tokenBReservePda.toString(), "The pool's token B reserve account does not match expected address");
  });

  it("Add liguidity function changes account balances of tokens A and B correctly", async () => {
    // Get the initial balances of the user token accounts and the liquidity pool token accounts
    const initialUserTokenAInfo = await getAccount(connection, userTokenAAccount.address);
    const initialUserTokenABalance = initialUserTokenAInfo.amount;
    const initialUserTokenBInfo = await getAccount(connection, userTokenBAccount.address);
    const initialUserTokenBBalance = initialUserTokenBInfo.amount;

    const initialPoolTokenAInfo = await getAccount(connection, tokenAReservePda);
    const initialPoolTokenABalance = initialPoolTokenAInfo.amount;
    const initialPoolTokenBInfo = await getAccount(connection, tokenBReservePda);
    const initialPoolTokenBBalance = initialPoolTokenBInfo.amount;

    // Calculate the expected final token account balances if they add 2 of each tokens
    const amountA = BigInt(2 * 10 ** 9);
    const amountB = BigInt(2 * 10 ** 9);

    const expectedUserTokenABalance = initialUserTokenABalance - amountA;
    const expectedUserTokenBBalance = initialUserTokenBBalance - amountB;
    const expectedPoolTokenABalance = initialPoolTokenABalance + amountB;
    const expectedPoolTokenBBalance = initialPoolTokenBBalance + amountB;

    // Create the user's LP token account
    userTokenLPAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      LPMintPda,
      payer.publicKey
    );

    // Transaction accounts
    const accounts = {
      pool: poolPda,
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
    };

    // User adds liquidity to the pool
    try {
      const tx = await program.methods.addLiquidity(new anchor.BN(amountA.toString()), new anchor.BN(amountB.toString()))
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

    // Make sure all the new balances are correct
    assert.equal(finalUserTokenABalance, expectedUserTokenABalance, "New user token A account balance is wrong.");
    assert.equal(finalUserTokenBBalance, expectedUserTokenBBalance, "New user token B account balance is wrong.");
    assert.equal(finalPoolTokenABalance, expectedPoolTokenABalance, "New pool token A account balance is wrong.");
    assert.equal(finalPoolTokenBBalance, expectedPoolTokenBBalance, "New pool token B account balance is wrong.");
  });

  it("Add liquidity function mints LP token correctly", async () => {
    // Get the initial amounts of the user LP token account balance and the LP token mint supply
    const initialUserTokenLPInfo = await getAccount(connection, userTokenLPAccount.address);
    const initialUserTokenLPBalance = initialUserTokenLPInfo.amount;
    const initialLPMintInfo = await getMint(connection, LPMintPda);
    const initialLPMintSupply = initialLPMintInfo.supply;

    // Get expected change values
    const poolAReserves = await getAccount(connection, tokenAReservePda);
    const currentAReserves = new anchor.BN(poolAReserves.amount.toString());
    const poolBReserves = await getAccount(connection, tokenBReservePda)
    const currentBReserves = new anchor.BN(poolBReserves.amount.toString());

    const amountA = new anchor.BN(1 * 10 ** 9);
    const amountB = new anchor.BN(1 * 10 ** 9);
    const userDepositProportion = (amountA.add(amountB)).div(currentAReserves.add(currentBReserves))
    const expectedLPsMinted = userDepositProportion.mul(userDepositProportion);

    // Transaction accounts
    const accounts = {
      pool: poolPda,
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
    };

    // User adds liquidity to the pool
    try {
      const tx = await program.methods.addLiquidity(amountA, amountB)
        .accounts(accounts)
        .signers([payer])
        .rpc()
    } catch (error) {
      console.error("failed to add liquidity:", error)
    }

    // Get the final amounts of the user LP token account balance and the LP token mint supply
    const finalUserTokenLPInfo = await getAccount(connection, userTokenLPAccount.address);
    const finalUserTokenLPBalance = finalUserTokenLPInfo.amount;
    const finalLPMintInfo = await getMint(connection, LPMintPda);
    const finalLPMintSupply = finalLPMintInfo.supply;

    // Get the change in the user LP token account balance and the LP token mint supply
    const userTokenLPDifference = finalUserTokenLPBalance - initialUserTokenLPBalance;
    const LPMintSupplyDifference = finalLPMintSupply - initialLPMintSupply;

    // Make sure all the changes are correct
    assert.equal((userTokenLPDifference).toString(), expectedLPsMinted.toString(), "Users new LP token balance is not what was expected");
    assert.equal((LPMintSupplyDifference).toString(), expectedLPsMinted.toString(), "New total LP token mint supply is not what was expected");
  });

  it("Swap function changes user and pool account balances as expected", async () => {
    // Get the initial balances of the user token accounts and the liquidity pool token accounts
    const initialUserTokenAInfo = await getAccount(connection, userTokenAAccount.address);
    const initialUserTokenABalance = initialUserTokenAInfo.amount;
    const initialUserTokenBInfo = await getAccount(connection, userTokenBAccount.address);
    const initialUserTokenBBalance = initialUserTokenBInfo.amount;

    const initialPoolTokenAInfo = await getAccount(connection, tokenAReservePda);
    const initialPoolTokenABalance = initialPoolTokenAInfo.amount;
    const initialPoolTokenBInfo = await getAccount(connection, tokenBReservePda);
    const initialPoolTokenBBalance = initialPoolTokenBInfo.amount;

    // Calculate expected final balances of the token accounts if the user swapped 1 token A for some amount of token B
    const swapInAmount = BigInt(1 * 10 ** 9);
    const feeNumerator = BigInt(3);
    const feeDenominator = BigInt(1000);

    const tokenProduct = initialPoolTokenABalance * initialPoolTokenBBalance;
    const effectiveAmountIn = swapInAmount * feeNumerator / feeDenominator;
    const expectedSwapOutAmount = initialPoolTokenABalance - (tokenProduct / (initialPoolTokenABalance + effectiveAmountIn));

    const expectedUserTokenABalance = initialUserTokenABalance - swapInAmount;
    const expectedUserTokenBBalance = initialUserTokenBBalance + expectedSwapOutAmount;
    const expectedPoolTokenABalance = initialPoolTokenABalance + swapInAmount;
    const expectedPoolTokenBBalance = initialPoolTokenBBalance - expectedSwapOutAmount;

    // Account setup for swapping token A for token B
    const swap_accounts = {
      pool: poolPda,
      tokenInReserves: tokenAReservePda,
      tokenOutReserves: tokenBReservePda,
      user: payer.publicKey,
      userTokenIn: userTokenAAccount.address,
      userTokenOut: userTokenBAccount.address,
      token_program: TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    };

    // User swaps the tokens
    try {
      const tx = await program.methods.swap(new anchor.BN(swapInAmount.toString()))
        .accounts(swap_accounts)
        .signers([payer])
        .rpc()
    } catch (error) {
      console.error("failed to swap tokens:", error)
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

    // Make sure all the new balances are correct
    assert.equal(finalUserTokenABalance, expectedUserTokenABalance, "New user token A account balance is wrong.");
    assert.equal(finalUserTokenBBalance, expectedUserTokenBBalance, "New user token B account balance is wrong.");
    assert.equal(finalPoolTokenABalance, expectedPoolTokenABalance, "New pool token A account balance is wrong.");
    assert.equal(finalPoolTokenBBalance, expectedPoolTokenBBalance, "New pool token B account balance is wrong.");
  });
});

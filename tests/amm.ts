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

  // A second user that will be used in the remove liquidity tests
  let otherUser: anchor.web3.Keypair;
  let otherUserTokenAAccount: Account;
  let otherUserTokenBAccount: Account;
  let otherUserTokenLPAccount: Account;

  before(async () => {
    // Set up anchor to connect to the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    connection = provider.connection;

    // Set the AMM program ID
    program = anchor.workspace.Amm as Program<Amm>;
    ammId = program.programId;

    // Create a payer and give them sol
    // Most of the tests will just use payer.
    // The remove liquidity functions will involve a second user "otherUser" to create a more realistic testing environment.
    // So otherUser and their token accounts will get initialized and funded here as well.
    payer = Keypair.generate();
    otherUser = Keypair.generate();
    const amountofSol = 100;
    const airdropSigPayer = await connection.requestAirdrop(payer.publicKey, amountofSol * LAMPORTS_PER_SOL);
    const airdropSigOtherUser = await connection.requestAirdrop(otherUser.publicKey, amountofSol * LAMPORTS_PER_SOL);
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSigPayer,
    });
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSigOtherUser,
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

    // Create the payer's and otherUser's token accounts for tokens A and B
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
    otherUserTokenAAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      otherUser,
      tokenAMintPda,
      otherUser.publicKey
    );
    otherUserTokenBAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      otherUser,
      tokenBMintPda,
      otherUser.publicKey
    );

    // Fund the token accounts
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
    await mintTo(
      connection,
      otherUser,
      tokenAMintPda,
      otherUserTokenAAccount.address,
      mintAuthorityA,
      tokenAMintAmount * 10 ** decimals
    );
    await mintTo(
      connection,
      otherUser,
      tokenBMintPda,
      otherUserTokenBAccount.address,
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

  it("Add Liquidity function reverts if the submitted ratio is wrong", async () => {
    // Initial ratio should be 1:1, this is 2:1
    const amountA = BigInt(2 * 10 ** 9);
    const amountB = BigInt(1 * 10 ** 9);

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

    // User tries to add liquidity to the pool
    try {
      const tx = await program.methods.addLiquidity(new anchor.BN(amountA.toString()), new anchor.BN(amountB.toString()))
        .accounts(accounts)
        .signers([payer])
        .rpc();
      chai.assert(false, "should've failed but didn't")
    } catch (error) {
      assert.equal(error.error.errorCode.code, "IncorrectLiquidityRatio");
    }
  });

  it("Add Liquidity function reverts if submitted reserve token A account pool account are inconsistent", async () => {
    // Ratio is correct
    const amountA = BigInt(1 * 10 ** 9);
    const amountB = BigInt(1 * 10 ** 9);

    // Transaction accounts
    // The account tokenAReserves is set to the tokenBReservePda because we need to use an account that has already been initialized or it will return a different error.
    const accounts = {
      pool: poolPda,
      tokenLpMint: LPMintPda,
      tokenAMint: tokenAMintPda,
      tokenBMint: tokenBMintPda,
      tokenAReserves: tokenBReservePda, // This should trigger the error
      tokenBReserves: tokenBReservePda,
      user: payer.publicKey,
      userTokenA: userTokenAAccount.address,
      userTokenB: userTokenBAccount.address,
      userTokenLp: userTokenLPAccount.address,
      token_program: TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    };

    // User tries to add liquidity to the pool
    try {
      const tx = await program.methods.addLiquidity(new anchor.BN(amountA.toString()), new anchor.BN(amountB.toString()))
        .accounts(accounts)
        .signers([payer])
        .rpc();
      chai.assert(false, "should've failed but didn't")
    } catch (error) {
      assert.equal(error.error.errorCode.code, "IncorrectPoolTokenAccount");
    }
  });

  it("Add Liquidity function reverts if submitted reserve token A account pool account are inconsistent", async () => {
    // This is almost exactly the same as the previous test, the accounts are just both tokenAReservePda now.
    // Ratio is correct
    const amountA = BigInt(1 * 10 ** 9);
    const amountB = BigInt(1 * 10 ** 9);

    // Transaction accounts
    // The account tokenBReserves is set to the tokenAReservePda because we need to use an account that has already been initialized or it will return a different error.
    const accounts = {
      pool: poolPda,
      tokenLpMint: LPMintPda,
      tokenAMint: tokenAMintPda,
      tokenBMint: tokenBMintPda,
      tokenAReserves: tokenAReservePda,
      tokenBReserves: tokenAReservePda, // This should trigger the error
      user: payer.publicKey,
      userTokenA: userTokenAAccount.address,
      userTokenB: userTokenBAccount.address,
      userTokenLp: userTokenLPAccount.address,
      token_program: TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    };

    // User tries to add liquidity to the pool
    try {
      const tx = await program.methods.addLiquidity(new anchor.BN(amountA.toString()), new anchor.BN(amountB.toString()))
        .accounts(accounts)
        .signers([payer])
        .rpc();
      chai.assert(false, "should've failed but didn't")
    } catch (error) {
      assert.equal(error.error.errorCode.code, "IncorrectPoolTokenAccount");
    }

  });

  it("Remove Liquidity function reverts if the submitted lp token account has no lp tokens", async () => {
    // Transaction accounts
    const accounts = {
      pool: poolPda,
      tokenAReserves: tokenAReservePda,
      tokenBReserves: tokenBReservePda,
      tokenLpMint: LPMintPda,
      user: payer.publicKey,
      userTokenLp: userTokenLPAccount.address, // This account has no LP tokens yet so it should trigger an error
      userTokenA: userTokenAAccount.address,
      userTokenB: userTokenBAccount.address,
      token_program: TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    };

    // User tries to remove liquidity from the pool
    try {
      const tx = await program.methods.removeLiquidity()
        .accounts(accounts)
        .signers([payer])
        .rpc();
      chai.assert(false, "should've failed but didn't")
    } catch (error) {
      assert.equal(error.error.errorCode.code, "NoLiquidityPoolTokens");
    }
  });

  it("Swap function reverts if there is no liquidity in the pool", async () => {
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

    // User tries to swap the tokens
    const swapInAmount = BigInt(1 * 10 ** 9);
    try {
      const tx = await program.methods.swap(new anchor.BN(swapInAmount.toString()))
        .accounts(swap_accounts)
        .signers([payer])
        .rpc()
      chai.assert(false, "should've failed but didn't")
    } catch (error) {
      assert.equal(error.error.errorCode.code, "NoLiquidityInPool");
    }
  });

  it("Add liquidity function changes account balances of tokens A and B correctly", async () => {
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

  it("Add liquidity function changes the LP token balance and supply correctly", async () => {
    // Get the initial amounts of the user LP token account balance and the LP token mint supply
    const initialUserTokenLPInfo = await getAccount(connection, userTokenLPAccount.address);
    const initialUserTokenLPBalance = initialUserTokenLPInfo.amount;
    const initialLPMintInfo = await getMint(connection, LPMintPda);
    const initialLPMintSupply = initialLPMintInfo.supply;

    // Get expected final balance of the user LP token and the Lp token mint supply
    const poolAReserves = await getAccount(connection, tokenAReservePda);
    const currentAReserves = poolAReserves.amount;
    const poolBReserves = await getAccount(connection, tokenBReservePda)
    const currentBReserves = poolBReserves.amount;

    const amountA = BigInt(1 * 10 ** 9);
    const amountB = BigInt(1 * 10 ** 9);
    const userDepositProportion = (amountA + amountB) / (currentAReserves + currentBReserves);
    const expectedLPsMinted = userDepositProportion * userDepositProportion;

    const expectedUserTokenLPBalance = initialUserTokenLPBalance + expectedLPsMinted;
    const expectedLPMintSupply = initialLPMintSupply + expectedLPsMinted;

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

    // Get the final amounts of the user LP token account balance and the LP token mint supply
    const finalUserTokenLPInfo = await getAccount(connection, userTokenLPAccount.address);
    const finalUserTokenLPBalance = finalUserTokenLPInfo.amount;
    const finalLPMintInfo = await getMint(connection, LPMintPda);
    const finalLPMintSupply = finalLPMintInfo.supply;

    // Make sure the new balances are correct
    assert.equal(finalUserTokenLPBalance, expectedUserTokenLPBalance, "Users new LP token balance is wrong");
    assert.equal(finalLPMintSupply, expectedLPMintSupply, "New total LP token mint supply is wrong");
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
    const effectiveAmountIn = swapInAmount * (BigInt(1) - (feeNumerator / feeDenominator));
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

  describe("Remove liquidity test", () => {
    // To make this test more effective I am introducing a second user. Without the second user, when the first user removes their 
    // liquidity they would just get all the pool's A and B tokens back. Testing with multiple users tests a more realistic scenario.
    before(async () => {
      // Create the otherUser's LP token account
      otherUserTokenLPAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        otherUser,
        LPMintPda,
        otherUser.publicKey
      );

      // Transaction accounts
      const accounts = {
        pool: poolPda,
        tokenLpMint: LPMintPda,
        tokenAMint: tokenAMintPda,
        tokenBMint: tokenBMintPda,
        tokenAReserves: tokenAReservePda,
        tokenBReserves: tokenBReservePda,
        user: otherUser.publicKey,
        userTokenA: otherUserTokenAAccount.address,
        userTokenB: otherUserTokenBAccount.address,
        userTokenLp: otherUserTokenLPAccount.address,
        token_program: TOKEN_PROGRAM_ID,
        system_program: SystemProgram.programId,
      };

      // User adds liquidity to the pool
      // After the swap test the current ratio is A:4_000_000_000 to B:2_250_000_000 or 400:225 so these amounts work
      const amountA = BigInt(800 * 10 ** 7);
      const amountB = BigInt(450 * 10 ** 7);
      try {
        const tx = await program.methods.addLiquidity(new anchor.BN(amountA.toString()), new anchor.BN(amountB.toString()))
          .accounts(accounts)
          .signers([otherUser])
          .rpc()
      } catch (error) {
        console.error("failed to add liquidity:", error)
      }
    });

    it("Remove Liquidity function changes all token account balances correctly correctly", async () => {
      // The remove liquidiy function removes all the user's liquidity, so to simplify things I am checking all token balances in this test.
      // Get the initial balances of the user token accounts and the liquidity pool token accounts
      const initialUserTokenAInfo = await getAccount(connection, userTokenAAccount.address);
      const initialUserTokenABalance = initialUserTokenAInfo.amount;
      const initialUserTokenBInfo = await getAccount(connection, userTokenBAccount.address);
      const initialUserTokenBBalance = initialUserTokenBInfo.amount;

      const initialPoolTokenAInfo = await getAccount(connection, tokenAReservePda);
      const initialPoolTokenABalance = initialPoolTokenAInfo.amount;
      const initialPoolTokenBInfo = await getAccount(connection, tokenBReservePda);
      const initialPoolTokenBBalance = initialPoolTokenBInfo.amount;

      const initialUserTokenLPInfo = await getAccount(connection, userTokenLPAccount.address);
      const initialUserLPBalance = initialUserTokenLPInfo.amount;
      const initialLPMintInfo = await getMint(connection, LPMintPda);
      const initialLPMintSupply = initialLPMintInfo.supply;

      // Calculate the expected final token account balances
      const amountAOut = (initialPoolTokenABalance * initialUserLPBalance) / initialLPMintSupply;
      const amountBOut = (initialPoolTokenBBalance * initialUserLPBalance) / initialLPMintSupply;

      const expectedUserTokenABalance = initialUserTokenABalance + amountAOut;
      const expectedUserTokenBBalance = initialUserTokenBBalance + amountBOut;
      const expectedPoolTokenABalance = initialPoolTokenABalance - amountAOut;
      const expectedPoolTokenBBalance = initialPoolTokenBBalance - amountBOut;
      const expectedUserLPBalance = BigInt(0);
      const expectedLPMintSupply = initialLPMintSupply - initialUserLPBalance;

      // Transaction accounts
      const accounts = {
        pool: poolPda,
        tokenAReserves: tokenAReservePda,
        tokenBReserves: tokenBReservePda,
        tokenLpMint: LPMintPda,
        user: payer.publicKey,
        userTokenLp: userTokenLPAccount.address,
        userTokenA: userTokenAAccount.address,
        userTokenB: userTokenBAccount.address,
        token_program: TOKEN_PROGRAM_ID,
        system_program: SystemProgram.programId,
      };

      // User removes liquidity from the pool
      try {
        const tx = await program.methods.removeLiquidity()
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

      const finalUserTokenLPInfo = await getAccount(connection, userTokenLPAccount.address);
      const finalUserLPBalance = finalUserTokenLPInfo.amount;
      const finalLPMintInfo = await getMint(connection, LPMintPda);
      const finalLPMintSupply = finalLPMintInfo.supply;

      // Make sure all the new balances are correct
      assert.equal(finalUserTokenABalance, expectedUserTokenABalance, "New user token A account balance is wrong.");
      assert.equal(finalUserTokenBBalance, expectedUserTokenBBalance, "New user token B account balance is wrong.");
      assert.equal(finalPoolTokenABalance, expectedPoolTokenABalance, "New pool token A account balance is wrong.");
      assert.equal(finalPoolTokenBBalance, expectedPoolTokenBBalance, "New pool token B account balance is wrong.");
      assert.equal(finalUserLPBalance, expectedUserLPBalance, "New user token LP balance is wrong.");
      assert.equal(finalLPMintSupply, expectedLPMintSupply, "New LP Mint supply is wrong.");
    });
  });
});

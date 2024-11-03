import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createMint } from '@solana/spl-token';

describe("amm", () => {
  let connection: anchor.web3.Connection;
  let program: anchor.Program<Amm>;
  let ammId: anchor.web3.PublicKey;
  let payer: anchor.web3.Keypair;
  let tokenAMintAccount: anchor.web3.PublicKey;
  let tokenBMintAccount: anchor.web3.PublicKey;
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
    const airdropSig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSig,
    });

    // Create example SPL tokens
    const mintAuthority = Keypair.generate();
    const freezeAutority = Keypair.generate();
    const tokenAKeypair = Keypair.generate();
    const tokenBKeypair = Keypair.generate();
    const decimals = 9;

    // Derive PDA for example liquidity pool
    tokenAMintAccount = await createMint(connection, payer, mintAuthority.publicKey, freezeAutority.publicKey, decimals, tokenAKeypair);
    tokenBMintAccount = await createMint(connection, payer, mintAuthority.publicKey, freezeAutority.publicKey, decimals, tokenBKeypair);
    [poolPda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), tokenAMintAccount.toBuffer(), tokenBMintAccount.toBuffer()],
      ammId
    );
  })

  it("pool is initialzed", async () => {
    const accounts = {
      pool: poolPda,
      tokenAMint: tokenAMintAccount,
      tokenBMint: tokenBMintAccount,
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
    const [tokenAReservePda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reserves"), tokenAMintAccount.toBuffer(), poolPda.toBuffer()],
      ammId
    );
    const [tokenBReservePda,] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reserves"), tokenBMintAccount.toBuffer(), poolPda.toBuffer()],
      ammId
    );

    const accounts = {
      tokenAReserves: tokenAReservePda,
      tokenBReserves: tokenBReservePda,
      pool: poolPda,
      tokenAMint: tokenAMintAccount,
      tokenBMint: tokenBMintAccount,
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

  // use this for getting addresses for the add liq function const poolAccount = await program.account.pool.fetch(poolPublicKey);

});

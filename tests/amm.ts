import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createMint } from '@solana/spl-token';

describe("amm", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const program = anchor.workspace.Amm as Program<Amm>;
  const ammId = program.programId;

  const payer = Keypair.generate();

  // vars for creating example spl tokens
  const mintAuthority = Keypair.generate();
  const freezeAutority = Keypair.generate();
  const decimals = 9;

  const tokenAKeypair = Keypair.generate();
  const tokenBKeypair = Keypair.generate();

  it("pool Iinitialzed", async () => {
    // give payer sol
    const airdropSig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
    const latestBlockHash = await connection.getLatestBlockhash();

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSig,
    });

    const tokenAMintAccount = await createMint(connection, payer, mintAuthority.publicKey, freezeAutority.publicKey, decimals, tokenAKeypair);
    const tokenBMintAccount = await createMint(connection, payer, mintAuthority.publicKey, freezeAutority.publicKey, decimals, tokenBKeypair);
    const poolSeedWord = "pool";
    const [poolPda, _] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(poolSeedWord), tokenAMintAccount.toBuffer(), tokenBMintAccount.toBuffer()],
      ammId
    );

    const initAccounts = {
      pool: poolPda,
      user: payer.publicKey,
      tokenAMint: tokenAMintAccount,
      tokenBMint: tokenBMintAccount,
      token_program: TOKEN_PROGRAM_ID,
      system_program: ammId,
    };

    const tx = await program.methods.initializePool()
      .accounts(initAccounts)
      .signers([payer])
      .rpc();
    console.log("Your transaction signature", tx);
  });
});

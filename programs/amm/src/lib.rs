use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Mint};

declare_id!("4aYmUZwssmfkaN6igxi4Sgy3toi3D1dNGwJdwtGCWcjk");

#[program]
pub mod amm {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.token_a = ctx.accounts.token_a_mint.key();
        pool.token_b = ctx.accounts.token_b_mint.key();
        msg!("Pool Initialized");
        Ok(())
    }

    //pub fn add_liquidity(ctx: Context<AddLiquidity>) -> Result<()> {}

}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(init,
    seeds = [b"pool", token_a_mint.key().as_ref(), token_b_mint.key().as_ref()],
    bump,
    payer = user,
    space = DISCRIMINATOR + Pool::INIT_SPACE,
    )]
    pub pool: Account<'info, Pool>,
    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub token_a: Pubkey,
    pub token_b: Pubkey,
    pub token_a_reserves: Option<Pubkey>,
    pub token_b_reserves: Option<Pubkey>,
}

const DISCRIMINATOR: usize = 8;
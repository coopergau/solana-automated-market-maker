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
        pool.token_a_balance = 0;
        pool.token_b_balance = 0;
        msg!("Pool Initialized");
        Ok(())
    }

    pub fn a_fun(ctx: Context<ABruh>) -> Result<()> {
        msg!("Huh");
        Ok(())
    }
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
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ABruh<'info> {
    pub a_ting: Account<'info, Mint>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub token_a: Pubkey,
    pub token_b: Pubkey,
    pub token_a_balance: u64,
    pub token_b_balance: u64,
}

const DISCRIMINATOR: usize = 8;
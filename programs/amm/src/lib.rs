use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint, TokenAccount};

declare_id!("4aYmUZwssmfkaN6igxi4Sgy3toi3D1dNGwJdwtGCWcjk");

#[program]
pub mod amm {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.token_a_mint = ctx.accounts.token_a_mint.key();
        pool.token_b_mint = ctx.accounts.token_b_mint.key();
        
        msg!("Pool Initialized");
        Ok(())
    }

    pub fn initialize_pool_reserves(ctx: Context<InitializePoolReserves>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.token_a_reserves = ctx.accounts.token_a_reserves.key();
        pool.token_b_reserves = ctx.accounts.token_b_reserves.key();
        msg!("Pool Reserves Initialized");
        Ok(())
    }

    //pub fn add_liquidity(ctx: Context<AddLiquidity>) -> Result<()> {}

}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
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

#[derive(Accounts)]
pub struct InitializePoolReserves<'info> {
    #[account(
        init,
        seeds = [b"reserves", pool.token_a_mint.key().as_ref(), pool.key().as_ref()],
        bump,
        payer = user,
        token::mint = token_a_mint,
        token::authority = pool,
        )]
    pub token_a_reserves: Account<'info, TokenAccount>,
    
    #[account(
        init,
        seeds = [b"reserves", pool.token_b_mint.key().as_ref(), pool.key().as_ref()],
        bump,
        payer = user,
        token::mint = token_b_mint,
        token::authority = pool,
        )]
    pub token_b_reserves: Account<'info, TokenAccount>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,
    pub token_a_mint: Box<Account<'info, Mint>>,
    pub token_b_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub token_a_reserves: Pubkey,
    pub token_b_reserves: Pubkey,
}

const DISCRIMINATOR: usize = 8;
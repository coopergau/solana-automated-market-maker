use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Mint, TokenAccount, Transfer };

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

    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
        let from_a = &mut ctx.accounts.user_token_a;
        let from_b = &mut ctx.accounts.user_token_b;
        let to_a = &mut ctx.accounts.token_a_reserves;
        let to_b = &mut ctx.accounts.token_b_reserves;
        let authority = &mut ctx.accounts.user;

        let cpi_accounts_a = Transfer {
            from: from_a.to_account_info().clone(),
            to: to_a.to_account_info().clone(),
            authority: authority.to_account_info().clone(),
        };

        let cpi_accounts_b = Transfer {
            from: from_b.to_account_info().clone(),
            to: to_b.to_account_info().clone(),
            authority: authority.to_account_info().clone(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();

        token::transfer(
            CpiContext::new(cpi_program.clone(), cpi_accounts_a),
            amount_a)?;

        token::transfer(
            CpiContext::new(cpi_program.clone(), cpi_accounts_b),
            amount_b)?;
        Ok(())
    }

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
    pub pool: Box<Account<'info, Pool>>,
    pub token_a_mint: Box<Account<'info, Mint>>,
    pub token_b_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    pub pool: Account<'info, Pool>,
    pub token_a_mint: Box<Account<'info, Mint>>,
    pub token_b_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub token_a_reserves: Account<'info, TokenAccount>,
    #[account(mut)]
    pub token_b_reserves: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
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
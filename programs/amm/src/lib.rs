use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Mint, TokenAccount, Transfer, MintTo};

declare_id!("4aYmUZwssmfkaN6igxi4Sgy3toi3D1dNGwJdwtGCWcjk");

#[program]
pub mod amm {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.token_a_mint = ctx.accounts.token_a_mint.key();
        pool.token_b_mint = ctx.accounts.token_b_mint.key();
        pool.token_lp_mint = ctx.accounts.token_lp_mint.key();
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
        // Transfer user tokens A and B to the liquidity pool
        let user_a = &mut ctx.accounts.user_token_a;
        let user_b = &mut ctx.accounts.user_token_b;
        let pool_a = &mut ctx.accounts.token_a_reserves;
        let pool_b = &mut ctx.accounts.token_b_reserves;
        let user_authority = &mut ctx.accounts.user;
        let token_program = &ctx.accounts.token_program;

        let transfer_a_accounts = Transfer {
            from: user_a.to_account_info().clone(),
            to: pool_a.to_account_info().clone(),
            authority: user_authority.to_account_info().clone(),
        };

        let transfer_b_accounts = Transfer {
            from: user_b.to_account_info().clone(),
            to: pool_b.to_account_info().clone(),
            authority: user_authority.to_account_info().clone(),
        };

        token::transfer(
            CpiContext::new(token_program.to_account_info().clone(), transfer_a_accounts),
            amount_a)?;

        token::transfer(
            CpiContext::new(token_program.to_account_info().clone(), transfer_b_accounts),
            amount_b)?;

        // Mint liquidity pool tokens to the user
        let mint_lp = &ctx.accounts.token_lp_mint;
        let user_lp = &mut ctx.accounts.user_token_lp;
        let pool_authority = &ctx.accounts.pool;

        let total_lp_tokens = mint_lp.supply;
        let pool_token_a_amount = &ctx.accounts.token_a_reserves.amount;
        let pool_token_b_amount = &ctx.accounts.token_b_reserves.amount;
        let total_pool_tokens = pool_token_a_amount + pool_token_b_amount;
        let user_lp_token_amount;

        if total_pool_tokens == 0 {
            user_lp_token_amount = 1;
        } else {
            let user_deposit_proportion = (amount_a + amount_b) / total_pool_tokens;
            user_lp_token_amount = user_deposit_proportion * total_lp_tokens;
        }
        
        // Get pool account info for signing the mint_to transaction
        let (_, pool_bump) = Pubkey::find_program_address(
            &[b"pool", ctx.accounts.token_a_mint.key().as_ref(), ctx.accounts.token_b_mint.key().as_ref()],
            ctx.program_id
        );

        let token_a_mint_key = ctx.accounts.token_a_mint.key();
        let token_b_mint_key = ctx.accounts.token_b_mint.key();

        let pool_seeds = &[
            b"pool",
            token_a_mint_key.as_ref(),
            token_b_mint_key.as_ref(),
            &[pool_bump],
        ];

        let mint_lp_accounts = MintTo {
            mint: mint_lp.to_account_info().clone(),
            to: user_lp.to_account_info().clone(),
            authority: pool_authority.to_account_info().clone(),
        };
        
        token::mint_to(
            CpiContext::new_with_signer(
                token_program.to_account_info().clone(),
                mint_lp_accounts,
                &[&pool_seeds[..]],
            ),
            user_lp_token_amount)?;
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

    #[account(
        init,
        seeds = [b"mint", pool.key().as_ref()],
        bump,
        payer = user,
        mint::decimals = 9,
        mint::authority = pool,
    )]
    pub token_lp_mint: Account<'info, Mint>,

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
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub token_lp_mint: Account<'info, Mint>,
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
    #[account(mut)]
    pub user_token_lp: Account<'info, TokenAccount>,
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
    pub token_lp_mint: Pubkey,
}

const DISCRIMINATOR: usize = 8;
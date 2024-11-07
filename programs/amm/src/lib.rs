use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

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
        let cpi_token_program = &ctx.accounts.token_program;

        let transfer_a_cpi_accounts = Transfer {
            from: user_a.to_account_info(),
            to: pool_a.to_account_info(),
            authority: user_authority.to_account_info(),
        };

        let transfer_b_cpi_accounts = Transfer {
            from: user_b.to_account_info(),
            to: pool_b.to_account_info(),
            authority: user_authority.to_account_info(),
        };

        token::transfer(
            CpiContext::new(cpi_token_program.to_account_info(), transfer_a_cpi_accounts),
            amount_a,
        )?;

        token::transfer(
            CpiContext::new(cpi_token_program.to_account_info(), transfer_b_cpi_accounts),
            amount_b,
        )?;

        // Mint liquidity pool tokens to the user
        let mint_lp = &ctx.accounts.token_lp_mint;
        let user_lp = &mut ctx.accounts.user_token_lp;
        let pool = &ctx.accounts.pool;

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
        let token_a_mint_key = pool.token_a_mint;
        let token_b_mint_key = pool.token_b_mint;

        let (_, pool_bump) = Pubkey::find_program_address(
            &[
                b"pool",
                token_a_mint_key.as_ref(),
                token_b_mint_key.as_ref(),
            ],
            ctx.program_id,
        );

        let pool_seeds = &[
            b"pool",
            token_a_mint_key.as_ref(),
            token_b_mint_key.as_ref(),
            &[pool_bump],
        ];

        let mint_lp_cpi_accounts = MintTo {
            mint: mint_lp.to_account_info(),
            to: user_lp.to_account_info(),
            authority: pool.to_account_info(),
        };

        token::mint_to(
            CpiContext::new_with_signer(
                cpi_token_program.to_account_info(),
                mint_lp_cpi_accounts,
                &[&pool_seeds[..]],
            ),
            user_lp_token_amount,
        )?;
        Ok(())
    }

    pub fn remove_liquidity(ctx: Context<RemoveLiquidity>) -> Result<()> {
        // Burn the users LP tokens
        let mint_lp = &ctx.accounts.token_lp_mint;
        let user_lp = &ctx.accounts.user_token_lp;
        let user_authority = &mut ctx.accounts.user;
        let cpi_token_program = &ctx.accounts.token_program;

        let burn_amount = user_lp.amount;

        let burn_cpi_accounts = Burn {
            mint: mint_lp.to_account_info(),
            from: user_lp.to_account_info(),
            authority: user_authority.to_account_info(),
        };

        token::burn(
            CpiContext::new(cpi_token_program.to_account_info(), burn_cpi_accounts),
            burn_amount,
        )?;

        // Transfer the user their share of the pool's reserve tokens
        let pool_token_a = &ctx.accounts.token_a_reserves;
        let pool_token_b = &ctx.accounts.token_b_reserves;
        let user_token_a = &ctx.accounts.user_token_a;
        let user_token_b = &ctx.accounts.user_token_b;
        let pool = &ctx.accounts.pool;
        let token_a_mint_key = pool.token_a_mint;
        let token_b_mint_key = pool.token_b_mint;

        let total_lp_tokens = mint_lp.supply;
        let user_lp_proportion = burn_amount / total_lp_tokens;
        let user_token_a_owed = pool_token_a.amount * user_lp_proportion;
        let user_token_b_owed = pool_token_b.amount * user_lp_proportion;

        // Get pool account info for signing the transfer transaction
        let (_, pool_bump) = Pubkey::find_program_address(
            &[
                b"pool",
                token_a_mint_key.as_ref(),
                token_b_mint_key.as_ref(),
            ],
            ctx.program_id,
        );

        let pool_seeds = &[
            b"pool",
            token_a_mint_key.as_ref(),
            token_b_mint_key.as_ref(),
            &[pool_bump],
        ];

        let transfer_a_cpi_accounts = Transfer {
            from: pool_token_a.to_account_info(),
            to: user_token_a.to_account_info(),
            authority: pool.to_account_info(),
        };

        // Transfer token A to user
        token::transfer(
            CpiContext::new_with_signer(
                cpi_token_program.to_account_info(),
                transfer_a_cpi_accounts,
                &[&pool_seeds[..]],
            ),
            user_token_a_owed,
        )?;

        let transfer_b_cpi_accounts = Transfer {
            from: pool_token_b.to_account_info(),
            to: user_token_b.to_account_info(),
            authority: pool.to_account_info(),
        };

        // Transfer token B to user
        token::transfer(
            CpiContext::new_with_signer(
                cpi_token_program.to_account_info(),
                transfer_b_cpi_accounts,
                &[&pool_seeds[..]],
            ),
            user_token_b_owed,
        )?;
        Ok(())
    }

    pub fn swap(ctx: Context<Swap>, amount_in: u64) -> Result<()> {
        // Calculate the amount of tokens the user gets from the swap
        // 0.3% fee represented using u64s
        const FEE_NUMERATOR: u64 = 3;
        const FEE_DENOMINATOR: u64 = 1000;
        let pool_reserves_in = &ctx.accounts.token_in_reserves;
        let pool_reserves_out = &ctx.accounts.token_out_reserves;

        let token_in_balance = pool_reserves_in.amount;
        let token_out_balance = pool_reserves_out.amount;
        let token_product = token_in_balance * token_out_balance;
        let effective_amount_in = amount_in * FEE_NUMERATOR / FEE_DENOMINATOR;

        let amount_out =
            token_out_balance - (token_product / (token_in_balance + effective_amount_in));

        // Send the tokens in to the pool
        let user_token_in_account = &ctx.accounts.user_token_in;
        let user_authority = &ctx.accounts.user;
        let cpi_token_program = &ctx.accounts.token_program;

        let transfer_in_cpi_accounts = Transfer {
            from: user_token_in_account.to_account_info(),
            to: pool_reserves_in.to_account_info(),
            authority: user_authority.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                cpi_token_program.to_account_info(),
                transfer_in_cpi_accounts,
            ),
            amount_in,
        )?;

        // Get pool account info for signing the mint_to transaction
        let token_a_mint_key = ctx.accounts.pool.token_a_mint;
        let token_b_mint_key = ctx.accounts.pool.token_b_mint;

        let (_, pool_bump) = Pubkey::find_program_address(
            &[
                b"pool",
                token_a_mint_key.as_ref(),
                token_b_mint_key.as_ref(),
            ],
            ctx.program_id,
        );

        let pool_seeds = &[
            b"pool",
            token_a_mint_key.as_ref(),
            token_b_mint_key.as_ref(),
            &[pool_bump],
        ];

        // Send the tokens out to the user
        let user_token_out_account = &ctx.accounts.user_token_out;
        let pool = &ctx.accounts.pool;

        let transfer_out_cpi_accounts = Transfer {
            from: pool_reserves_out.to_account_info(),
            to: user_token_out_account.to_account_info(),
            authority: pool.to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                cpi_token_program.to_account_info(),
                transfer_out_cpi_accounts,
                &[&pool_seeds[..]],
            ),
            amount_out,
        )?;
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
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub token_lp_mint: Account<'info, Mint>,
    #[account(mut)]
    pub token_a_reserves: Account<'info, TokenAccount>,
    #[account(mut)]
    pub token_b_reserves: Account<'info, TokenAccount>,
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

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    pub pool: Account<'info, Pool>,
    pub token_a_reserves: Account<'info, TokenAccount>,
    pub token_b_reserves: Account<'info, TokenAccount>,
    #[account(mut)]
    pub token_lp_mint: Account<'info, Mint>,
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_token_lp: Account<'info, TokenAccount>,
    pub user_token_a: Account<'info, TokenAccount>,
    pub user_token_b: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub token_in_reserves: Account<'info, TokenAccount>,
    #[account(mut)]
    pub token_out_reserves: Account<'info, TokenAccount>,
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_token_in: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_out: Account<'info, TokenAccount>,
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

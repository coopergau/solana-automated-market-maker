# Solana Automated Market Maker

# Description
Users can swap tokens using liquidity pools. The swap prices are determined by the amounts of the two tokens in the liquidity pool. Users can also provide liquidity to the pool an get a proportional amount of the fees generated by the pool 


# To do

front end stuff sucks make tests for deployed version on devnet - also verify contract or something like that

secuirity checks in functions to make sure like the pool account and mint accounts and reserves and all that correspond to each other
remove liquidity function
swap function

dont need the mint_a and mint_b addresses as accounts in the add and remove liquidity function because they are stored in the pool. check to see if we need them in the functions or if we can just do this

check when you need to borrow ownership from the ctx struct

natspec like info

Things to test
 - The add add liquidity mints the right amount of LP tokens if the ratio is different - right now we just test the first liq providor so the amount is always 1 - so this could be an integration test, like liquidity is provided, swaps happen, then test the add liquidity function still works after that
   // use this in front end for getting addresses for the add liq function const poolAccount = await program.account.pool.fetch(poolPublicKey);

use signTransaction, serialize it, and sendRawtransaction to get more descriptive errors if signAndSendTransaction isnt working
# Automated Market Maker

# Description
Users can swap tokens using liquidity pools. The swap prices are determined by the amounts of the two tokens in the liquidity pool. Users can also provide liquidity to the pool an get a proportional amount of the fees generated by the pool 

## Functions List
1. initialze pool
2. Add liquidity
    - deposit tokens according to the current pool ratio
    - get back the pool share tokens
3. remove liquidity + rewards
    - deposit the pool share tokens
    - get back the tokens according to new current ratio
4. mint pool token
5. swap tokens
    - pay a fee to the liquidity pool - 0.3%

# To do
Add the add liquidity function - make it create the pool token accounts if they havent been, so they get auto created on the first fund
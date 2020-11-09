# BoMH
Bank of Moral Hazard is a bank that issues a USD-pegged stablecoin in return for USD-pegged stablecoins collateral. It lends out a defined fraction of its reserve collateral to lending platforms (via mStable) and auctions off the profits in return for `mhCoin`. It burns `mhCoin`s it receives from the auction, which reduces the supply of `mhCoin`, drives up the price of `mhCoin`, and therefore translates profits to holders fo the token, similar to a stock buyback. What could possibly go wrong?!? Such a bank has absolutely never had any black swans occur ever.

Jokes aside, this actually isn't a bad idea since, with regular banks, their collateral is very illiquid (real estate), whereas the collateral used in BoMH is liquid and can be withdrawn any time (until a black swan comes along...)

Tests can be run with `yarn test`.

The tests use EVM reverts to rewind the state to just a desired point, thereby eliminating the need to redeploy contract every time a "fresh slate" is desired.
Beause of the use of reverts before and after every unit test (in the form of `beforeEach` and `afterEach` Mocha blocks), a fresh state is guaranteed to ensure tests don't interfere with eachother.

If I had more time to spend on this, I'd have added a DAO, so that the governance token (`mhCoin`) can actually be used for governance to set things like the fraction of reserves to keep etc.

I think I found 2 'bugs' in the mStable contract - I observed masset user balances being reduced by the equivalent of 1wei by functions that shouldn't affect them. I included details in the tests. It's unclear whether the effects were intentional or not, but they certainly make specific actions fail that shouldn't. The example in the tests is less clear now that I've written many more tests since then (the changes required to observe it make a bunch of other tests fail), so I'll probably make another branch that only shows the bug case.

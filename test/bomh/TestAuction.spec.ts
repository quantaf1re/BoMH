import { expectEvent, time, expectRevert } from "@openzeppelin/test-helpers";
import { fullScale, ZERO, ONE_DAY, ZERO_ADDRESS, DEAD_ADDRESS } from "@utils/constants";

import { BN } from "@utils/tools";
import * as t from "types/generated";
import { createSnapshot, revertToSnapshot } from "../helpers/blockchain";
import { MassetMachine, StandardAccounts, SystemMachine, MassetDetails } from "@utils/machines";
import { expect } from "chai";


const Auction = artifacts.require("Auction");
const MockERC20 = artifacts.require("MockERC20");

// Tests the functionality of the auction contract
// plus edge cases. Since almost every action depends on 
// previous actions, this test is structured as a sequence
// of actions in every `before` block. Snapshots are used
// within each describe block to revert back to after the
// actions in the `before` block of that describe block.
// Thus, the actions in `before` aren't reverted, but the
// `it` tests are, relative to their `before` block
contract("Auction", async (accounts) => {

    const sa = new StandardAccounts(accounts);
    let systemMachine: SystemMachine;
    let massetMachine: MassetMachine;
    let massetDetails: MassetDetails;
    let mUSD: t.MassetInstance;

    let token: t.MockErc20Instance;
    let auction: t.AuctionInstance;
    let snapshot: any;
    let mUSDTotSup: BN;
    let auctionInitTime: BN;
    let beneficiary: string;
    const TOKEN_TOT_SUP = fullScale.mul(new BN(1000));
    const INIT_TOKEN_BALS = TOKEN_TOT_SUP.div(new BN(2));
    const BID1_AMOUNT = fullScale.mul(new BN(10));
    const BID2_AMOUNT = BID1_AMOUNT.mul(new BN(2));

    before(async () => {
        systemMachine = new SystemMachine(sa.all);
        await systemMachine.initialiseMocks(false, true);
        massetMachine = systemMachine.massetMachine;
        massetDetails = await massetMachine.deployMassetAndSeedBasket();
        mUSD = massetDetails.mAsset;
        mUSDTotSup = await mUSD.totalSupply();


        // Create contracts
        token = await MockERC20.new("TokenA", "TA", 18, sa.default, TOKEN_TOT_SUP.div(fullScale));
        beneficiary = sa.dummy3;
        // auctionInitTime = (await web3.eth.getBlockNumber()).timestamp;
        auction = await Auction.new(ONE_DAY, beneficiary, mUSD.address, token.address, { from: sa.dummy1 });
        const auctionTx = await web3.eth.getTransaction(auction.transactionHash);
        auctionInitTime = new BN((await web3.eth.getBlock(auctionTx.blockNumber)).timestamp);

        // Set initial balances
        await mUSD.transfer(auction.address, mUSDTotSup, { from: sa.default });
        await token.transfer(sa.dummy1, INIT_TOKEN_BALS, { from: sa.default });
        await token.transfer(sa.dummy2, INIT_TOKEN_BALS, { from: sa.default });
        await token.approve(auction.address, INIT_TOKEN_BALS, { from: sa.dummy1 });
        await token.approve(auction.address, INIT_TOKEN_BALS, { from: sa.dummy2 });

        expect(await mUSD.balanceOf(auction.address)).bignumber.eq(mUSDTotSup);
        expect(await token.balanceOf(auction.address)).bignumber.eq(ZERO);

    });

    it("Verifying default storage", async () => {
        expect(await auction.beneficiary()).eq(beneficiary);
        expect(await auction.auctionEndTime()).bignumber.eq(auctionInitTime.add(ONE_DAY));
        expect(await auction.prizeToken()).eq(mUSD.address);
        expect(await auction.bidToken()).eq(token.address);
        expect(await auction.highestBidder()).eq(beneficiary);
        expect(await auction.highestBid()).bignumber.eq(ZERO);
        expect(await auction.ended()).eq(false);
    });

    // Covers the edge case where no bids have been made but someone
    // sent tokens to the auction contract without calling `bid`
    it("Send excess tokens before 1st bid to beneficiary", async () => {
        // No point creating another `describe` block just for
        // this 1 test which has to be done before any bids
        snapshot = await createSnapshot();

        await token.transfer(auction.address, BID1_AMOUNT, { from: sa.dummy2 });
        await auction.bid(BID1_AMOUNT, { from: sa.dummy1 });

        expect(await token.balanceOf(auction.address)).bignumber.eq(BID1_AMOUNT);
        expect(await token.balanceOf(beneficiary)).bignumber.eq(BID1_AMOUNT);
        expect(await token.balanceOf(sa.dummy2)).bignumber.eq(INIT_TOKEN_BALS.sub(BID1_AMOUNT));

        await revertToSnapshot(snapshot);
    });


    async function validBid(bidAmount: BN, bidder: string, bidTx: any) {
        expect(await token.balanceOf(auction.address)).bignumber.eq(bidAmount);
        expect(await auction.highestBidder()).eq(bidder);
        expect(await auction.highestBid()).bignumber.eq(bidAmount);
        await expectEvent(bidTx.receipt, "HighestBidIncreased", {
            bidder: bidder,
            amount: bidAmount,
        });
    }

    async function revBidAucEnd(bidAmount: BN, bidder: string) {
        await time.increase(ONE_DAY);
        await expectRevert(
            auction.bid(bidAmount.mul(new BN(2)), { from: bidder }),
            "Auction already ended.",
        );
    }

    async function revBidNotHigher(bidder: string) {
        await expectRevert(
            auction.bid(ZERO, { from: bidder }),
            "There already is a higher bid.",
        );
    }

    describe("1st bid", async () => {
        let bid1Tx: any;

        before(async () => {
            bid1Tx = await auction.bid(BID1_AMOUNT, { from: sa.dummy1 });
        });

        // It would be nice to include this in `before` rather than
        // here but for some reason that doesn't work
        beforeEach("creating snapshot", async () => {
            snapshot = await createSnapshot();
        });
    
        afterEach("reverting to snapshot", async () => {
            await revertToSnapshot(snapshot);
        });

        it("Valid bid", async () => {
            await validBid(BID1_AMOUNT, sa.dummy1, bid1Tx);
        });

        it("Revert auction ended", async () => {
            await revBidAucEnd(BID1_AMOUNT, sa.dummy1);
        });

        it("Revert bid not higher", async () => {
            await revBidNotHigher(sa.dummy1);
        });

        // Only need to test this endAuction revert condition once,
        // can't do it in `describe("Auction end"...`, and
        // it's cleaner to just include it here rather than
        // make another `describe(...` where another
        // beforeEach/afterEach pair would be needed again
        it("Revert Auction not yet ended", async () => {
            await expectRevert(
                auction.endAuction(),
                "Auction not yet ended",
            );
        });

        // Covers the edge case where a bid(s) has been made but someone
        // sends tokens to the auction contract after without calling `bid`
        it("Send excess tokens after bids to previous bidder", async () => {
            await token.transfer(auction.address, BID1_AMOUNT, { from: sa.dummy2 });
            // auction now has 20 tokens
            await auction.bid(BID2_AMOUNT, { from: sa.dummy2 });
            // auction just got given another 20 tokens, but sent 20 to old bidder
            
            expect(await token.balanceOf(auction.address)).bignumber.eq(BID2_AMOUNT);
            expect(await token.balanceOf(beneficiary)).bignumber.eq(ZERO);
            expect(await token.balanceOf(sa.dummy1)).bignumber.eq(
                INIT_TOKEN_BALS.add(BID1_AMOUNT)
            );
            expect(await token.balanceOf(sa.dummy2)).bignumber.eq(
                INIT_TOKEN_BALS.sub(BID2_AMOUNT).sub(BID1_AMOUNT)
            );
        });

        // Covers the edge case where the someone sends tokens to the
        // auction between the last bid and endAuction() - should send
        // excess to the beneficiary
        it("Send excess tokens at auction end to beneficiary", async () => {
            await time.increase(ONE_DAY);
            await token.transfer(auction.address, BID1_AMOUNT, { from: sa.dummy2 });
            // auction now has 20 tokens
            await auction.endAuction();

            // token state
            expect(await token.balanceOf(auction.address)).bignumber.eq(ZERO);
            expect(await token.balanceOf(beneficiary)).bignumber.eq(BID2_AMOUNT);
            expect(await token.balanceOf(sa.dummy1)).bignumber.eq(
                INIT_TOKEN_BALS.sub(BID1_AMOUNT)
                );
            expect(await token.balanceOf(sa.dummy2)).bignumber.eq(
                INIT_TOKEN_BALS.sub(BID1_AMOUNT)
            );
            
            // mUSD state
            expect(await mUSD.balanceOf(auction.address)).bignumber.eq(ZERO);
            expect(await mUSD.balanceOf(sa.dummy1)).bignumber.eq(mUSDTotSup);
        });

    })

    describe("2nd bid", async () => {
                
        let bid2Tx: any;

        before(async () => {
            bid2Tx = await auction.bid(BID2_AMOUNT, { from: sa.dummy2 });
        });

        beforeEach("creating snapshot", async () => {
            snapshot = await createSnapshot();
        });
    
        afterEach("reverting to snapshot", async () => {
            await revertToSnapshot(snapshot);
        });

        it("Valid bid", async () => {
            await validBid(BID2_AMOUNT, sa.dummy2, bid2Tx);
        });

        it("Revert auction ended", async () => {
            await revBidAucEnd(BID2_AMOUNT, sa.dummy2);
        });

        it("Revert bid not higher", async () => {
            await revBidNotHigher(sa.dummy2);
        });
    })

    describe("End auction", async () => {

        let endAuction: any;
        
        before(async () => {
            // Can't reverse time after this, so need to
            // test "Auction not yet ended" earlier
            await time.increase(ONE_DAY);
            endAuction = await auction.endAuction();
        });

        it("valid end", async () => {
            // auction contract state
            expect(await auction.ended()).eq(true);
            await expectEvent(endAuction.receipt, "AuctionEnded", {
                winner: sa.dummy2,
                amount: BID2_AMOUNT,
            });

            // token state
            expect(await token.balanceOf(auction.address)).bignumber.eq(ZERO);
            expect(await token.balanceOf(sa.default)).bignumber.eq(ZERO);
            expect(await token.balanceOf(sa.dummy1)).bignumber.eq(INIT_TOKEN_BALS);
            expect(await token.balanceOf(sa.dummy2)).bignumber.eq(INIT_TOKEN_BALS.sub(BID2_AMOUNT));
            expect(await token.balanceOf(sa.dummy3)).bignumber.eq(BID2_AMOUNT);

            // mUSD state
            expect(await mUSD.balanceOf(auction.address)).bignumber.eq(ZERO);
            expect(await mUSD.balanceOf(sa.default)).bignumber.eq(ZERO);
            expect(await mUSD.balanceOf(sa.dummy1)).bignumber.eq(ZERO);
            expect(await mUSD.balanceOf(sa.dummy2)).bignumber.eq(mUSDTotSup);
            expect(await mUSD.balanceOf(sa.dummy3)).bignumber.eq(ZERO);
        });
        
        it("revert endAuction already ended", async () => {
            await expectRevert(
                auction.endAuction(),
                "AuctionEnd already been called",
            );
        });


    })
});

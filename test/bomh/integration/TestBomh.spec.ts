import { expectEvent, time, expectRevert } from "@openzeppelin/test-helpers";
import { fullScale, ZERO, ONE_DAY, TEN_DAYS, ZERO_ADDRESS, DEAD_ADDRESS } from "@utils/constants";
import * as t from "types/generated";
import * as bc from "@utils/bomhConstants";

import { expect } from "chai";
import { BN } from "@utils/tools";
import { BoMHMachine } from "@utils/machines";
import { validInitState, validGetReserveTokens, validDeposit, validCashOut, validBid, revBidAucEnd, revBidNotHigher } from "../shared/bomhShared";
import { createSnapshot, revertToSnapshot } from "../../helpers/blockchain";


const MockERC20 = artifacts.require("MockERC20");
const Auction = artifacts.require("Auction");


// Since this test will focus on progressively doing actions with bomh
// and testing the results of those actions, we'll do the transactions in 
// `before` blocks so that they aren't reverted by the evm revert in
// `afterEach`. However that means that the evm won't revert back to
// the state after `BoMHMachine.init()`, so we'll have to create a
// new one here so it doesn't interfere with the other tests
contract("Bank of Moral Hazard Integration", async (accounts) => {

    let snapshot: any;
    let auction: t.AuctionInstance;
    let bm: BoMHMachine;

    before(async () => {
        bm = new BoMHMachine();
        await bm.init(accounts);
    });

    beforeEach("creating snapshot", async () => {
        snapshot = await createSnapshot();
    });

    afterEach("reverting to snapshot", async () => {
        await revertToSnapshot(snapshot);
    });

    it("Verifying default storage", async () => {
        await validInitState(bm);
    });

    it("getReserveTokens valid", async () => {
        await validGetReserveTokens(bm);
    });

    it("Revert deposit zero address", async () => {
        await expectRevert(
            bm.bomh.deposit(ZERO_ADDRESS, bc.SC_INIT_AMOUNT, { from: bm.sa.dummy1 }),
            "Need a token address",
        );
    });

    it("Revert deposit zero bassetQuantity", async () => {
        await expectRevert(
            bm.bomh.deposit(bm.tusd.address, 0, { from: bm.sa.dummy1 }),
            "Get your peasant ass out of here",
        );
    });

    it("Revert withdraw zero mhUSDAmount", async () => {
        await expectRevert(
            bm.bomh.withdraw(0, { from: bm.sa.dummy1 }),
            "Get your peasant ass out of here",
        );
    });

    it("Revert withdraw not enough bm.mhUSD balance", async () => {
        await expectRevert(
            bm.bomh.withdraw(1, { from: bm.sa.dummy1 }),
            "Not enough coins",
        );
    });

    it("Revert mhCoinBurn no credits", async () => {
        await expectRevert(
            bm.bomh.mhCoinBurn({ from: bm.sa.dummy1 }),
            "Need to burn non-zero amount",
        );
    });

    it("Revert cashOut no credits", async () => {
        await expectRevert(
            bm.bomh.cashOut({ from: bm.sa.dummy1 }),
            "Saver has no credits",
        );
    });

    describe("Deposit", async () => {

        let depositTx: any;

        before(async () => {
            depositTx = await bm.bomh.deposit(bm.tusd.address, bc.DEP_AMOUNT, { from: bm.sa.dummy1});
        });

        it("Valid deposit", async () => {
            await validDeposit(bm, depositTx);
        });
    });

    // This withdrawal will not be undone so it can be used further below
    describe(`Deposit usdt, send mhUSD, and withdraw from different account, after 
        some swaps and collectAndDistributeInterest()`, async () => {

        let depositTx: any;
        let withdrawTx: any;
        const totalMHUSDWdrw = bc.DEP_AMOUNT.add(bc.DEP_AMOUNT2);

        before(async () => {
            // Swap and generate fees/interest
            await bm.genInterest();

            // Deposit with usdt
            await bm.usdt.transfer(bm.sa.dummy2, bc.DEP_AMOUNT2, { from: bm.sa.default });
            await bm.usdt.approve(bm.bomh.address, bc.DEP_AMOUNT2, { from: bm.sa.dummy2 });
            depositTx = await bm.bomh.deposit(bm.usdt.address, bc.DEP_AMOUNT2, { from: bm.sa.dummy2});
            
            // Send all mhUSD from dummy1 to dummy3
            await bm.mhUSD.transfer(bm.sa.dummy3, bc.DEP_AMOUNT, { from: bm.sa.dummy1 });
            await bm.mhUSD.transfer(bm.sa.dummy3, bc.DEP_AMOUNT2, { from: bm.sa.dummy2 });
            
            // Withdraw
            withdrawTx = await bm.bomh.withdraw(totalMHUSDWdrw, { from: bm.sa.dummy3 });
        });

        it("Valid withdraw", async () => {
            // Can't use the standard validWithdraw here, need to customise alot
            
            // tusd
            expect(await bm.tusd.balanceOf(bm.bomh.address)).bignumber.eq(ZERO);
            expect(await bm.usdt.balanceOf(bm.bomh.address)).bignumber.eq(ZERO);

            // tusd and usdt
            const fractionLent = bc.MAX_FRAC.sub(bc.RES_FRAC);
            const lentAmount = totalMHUSDWdrw.mul(fractionLent).div(bc.MAX_FRAC);
            const feePaid = lentAmount.mul(bm.swapFee).div(fullScale);
            const totalLeft = totalMHUSDWdrw.sub(feePaid);
            // Since bomh uses mStable's receommendation for which collateral to
            // redeem, it's easier to just check the total returned because
            // the collateral is interchangeable
            const totalBal = (await bm.tusd.balanceOf(bm.sa.dummy3))
                .add(await bm.usdt.balanceOf(bm.sa.dummy3));
            expect(totalLeft).bignumber.eq(totalBal);
            
            // mStable
            expect(await bm.mstHelp.getSaveBalance(bm.mUSDSAVE.address, bm.bomh.address))
                .bignumber.not.eq(ZERO);
            
            // mhUSD
            expect(await bm.mhUSD.balanceOf(bm.sa.dummy3)).bignumber.eq(ZERO);
            expect(await bm.mhUSD.totalSupply()).bignumber.eq(ZERO);
            
            // bomh
            await expectEvent(withdrawTx.receipt, "Withdrawn", {
                withdrawer: bm.sa.dummy3,
                bassetQuantity: totalMHUSDWdrw,
            });
        });

        it("Revert mhCoinBurn no credits", async () => {
            await expectRevert(
                bm.bomh.mhCoinBurn({ from: bm.sa.dummy1 }),
                "Need to burn non-zero amount",
            );
        });
    });

    describe("Cashing out", async () => {

        let cashOutTx: any;

        before(async () => {
            cashOutTx = await bm.bomh.cashOut();
            auction = await Auction.at(await bm.bomh.indexToAuctionAddr(0));
        });

        it("cashOut valid", async () => {
            await validCashOut(bm, auction, cashOutTx);
        });
    });

    describe("1st auction bid", async () => {

        let bidTx: any;

        before(async () => {
            await bm.mhCoin.transfer(bm.sa.dummy4, bc.BID_AMOUNT1, { from: bm.sa.default });
            await bm.mhCoin.approve(auction.address, bc.BID_AMOUNT1, { from: bm.sa.dummy4 });
            bidTx = await auction.bid(bc.BID_AMOUNT1, { from: bm.sa.dummy4 });
        });

        it("Valid bid", async () => {
            await validBid(auction, bm.mhCoin, bc.BID_AMOUNT1, bm.sa.dummy4, bidTx);
        });

        it("Revert auction ended", async () => {
            await revBidAucEnd(auction, bc.BID_AMOUNT1, bm.sa.dummy1);
        });

        it("Revert bid not higher", async () => {
            await revBidNotHigher(auction, bm.sa.dummy1);
        });

        it("Revert Auction not yet ended", async () => {
            await expectRevert(
                auction.endAuction(),
                "Auction not yet ended",
            );
        });
    });

    describe("2nd auction bid", async () => {

        let bidTx: any;

        before(async () => {
            await bm.mhCoin.transfer(bm.sa.other, bc.BID_AMOUNT2, { from: bm.sa.default });
            await bm.mhCoin.approve(auction.address, bc.BID_AMOUNT2, { from: bm.sa.other });
            bidTx = await auction.bid(bc.BID_AMOUNT2, { from: bm.sa.other });
        });

        it("Valid bid", async () => {
            await validBid(auction, bm.mhCoin, bc.BID_AMOUNT2, bm.sa.other, bidTx);
        });

        it("Revert auction ended", async () => {
            await revBidAucEnd(auction, bc.BID_AMOUNT2, bm.sa.other);
        });

        it("Revert bid not higher", async () => {
            await revBidNotHigher(auction, bm.sa.other);
        });

        it("Revert Auction not yet ended", async () => {
            await expectRevert(
                auction.endAuction(),
                "Auction not yet ended",
            );
        });
    });


    describe("Auction end", async () => {

        let mUSDAuctionBal: BN;

        before(async () => {
            mUSDAuctionBal = await bm.mUSD.balanceOf(auction.address);
            // bid and end auction
            await time.increase(ONE_DAY);
            await auction.endAuction();
        });

        it("valid end", async () => {
            // This is already tested in TestAuction, but worth a quick check
            // Need to check here before
            // mhUSD
            expect(await bm.mhCoin.balanceOf(bm.sa.dummy4)).bignumber.eq(bc.BID_AMOUNT1);
            expect(await bm.mhCoin.balanceOf(bm.bomh.address)).bignumber.eq(bc.BID_AMOUNT2);
            expect(await bm.mhCoin.balanceOf(auction.address)).bignumber.eq(ZERO);
            
            // mUSD
            expect(await bm.mUSD.balanceOf(bm.sa.other)).bignumber.eq(mUSDAuctionBal);
            expect(await bm.mUSD.balanceOf(auction.address)).bignumber.eq(ZERO);
            expect(await auction.ended()).eq(true);
        });
    });


    describe("mhCoinBurn after auction", async () => {

        before(async () => {
            // Burn all mhUSD held by bomh (the amount bidded on the auction)
            await bm.bomh.mhCoinBurn();
        });

        it("Valid mhCoinBurn", async () => {
            expect(await bm.mhCoin.balanceOf(bm.bomh.address)).bignumber.eq(ZERO);
            expect(await bm.mhCoin.totalSupply()).bignumber.eq(bc.MHCOIN_INIT_SUP.sub(bc.BID_AMOUNT2));
        });
    });
});
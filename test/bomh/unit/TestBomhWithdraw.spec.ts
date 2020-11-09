import { expectEvent, time, expectRevert } from "@openzeppelin/test-helpers";
import { fullScale, ZERO, ONE_DAY, TEN_DAYS, ZERO_ADDRESS, DEAD_ADDRESS } from "@utils/constants";
import * as bc from "@utils/bomhConstants";

import { expect } from "chai";
import { BN } from "@utils/tools";
import { bm, validWithdraw } from "../shared/bomhShared";
import { createSnapshot, revertToSnapshot } from "../../helpers/blockchain";


contract("Bank of Moral Hazard Withdrawals", async (accounts) => {

    let snapshot: any;

    before(async () => {
        if (!bm.initiated) {
            console.log("Initiating BoMH");
            await bm.init(accounts);
        }
    });

    beforeEach("creating snapshot", async () => {
        snapshot = await createSnapshot();
        await bm.bomh.deposit(bm.tusd.address, bc.DEP_AMOUNT, { from: bm.sa.dummy1});
    });

    afterEach("reverting to snapshot", async () => {
        await revertToSnapshot(snapshot);
    });

    describe("Revert invalid withdrawals", async () => {
        it("Revert withdraw zero mhUSDAmount", async () => {
            await expectRevert(
                bm.bomh.withdraw(0, { from: bm.sa.dummy1 }),
                "Get your peasant ass out of here",
            );
        });
    
        it("Revert withdraw not enough mhUSD balance", async () => {
            await expectRevert(
                bm.bomh.withdraw(1, { from: bm.sa.dummy2 }),
                "Not enough coins",
            );
        });
    });
    
    describe("--------BUG SHOWCASE - CHECK CODE--------", async () => {
        it("Case 1", async () => {
            console.log(`
            -----------------NOTE-----------------
            There are 2 bugs I've discovered with 2 cases.
            Case 1: withdrawing straight after depositing
            Case 2: withdrawing after there have been some swaps
            by a 3rd party after depositing

            Bug 1 is that getSaveRedeemInput() returns 1 more than
            it should in both cases, meaning that it has to
            be compensated for when using the returned value, otherwise
            trying to redeem the amount that getSaveRedeemInput() returns
            will throw an error saying bm.bomh doesn't own that many credits.
            This error can be seen in the console.log() for both cases
            below.

            Bug 2 affects user balances, but only in case 2, curiously.
            When trying to redeem all bm.mUSD that the contract holds, it will
            fail attempting to burn in _settleRedemption(), saying it exceeds
            the balance of the burnee (bm.bomh).
            Look at the instructions under '----- BUG SHOWCASE -----' in 
            withdraw() to see this bug.
            It seems that bm.bomh's balance is decreased by 1 somehow by the
            sapping and collectAndDistributeInterest()
            Note: following the instructions  will show 2 transactions as
            failing - both are not the 2 transaction in this it() block,
            the 2nd transaction is from the '1st withdraw' describe block
            below, i.e. calling withdraw() without any swapping does
            not result in the 'exceeds balance' _burn error.

            ---Without any swapping before---
            getSaveRedeemInput() = 
            ${await bm.mstHelp.getSaveRedeemInput(bm.mUSDSAVE.address, bc.LENT_AMOUNT)}
            
            `);

            await bm.bomh.withdraw(bc.DEP_AMOUNT, { from: bm.sa.dummy1 });
        });

        it("Case 2", async () => {
            await bm.genInterest();

            console.log(`
            ---After swapping---
            getSaveRedeemInput() = 
            ${await bm.mstHelp.getSaveRedeemInput(bm.mUSDSAVE.address, bc.LENT_AMOUNT)}`)

            await bm.bomh.withdraw(bc.DEP_AMOUNT, { from: bm.sa.dummy1 });
        });
    });

    describe("1st withdraw, no swaps", async () => {

        let withdrawTx: any;

        beforeEach("withdrawing", async () => {
            withdrawTx = await bm.bomh.withdraw(bc.DEP_AMOUNT, { from: bm.sa.dummy1 });
        });

        it("Valid withdraw", async () => {
            await validWithdraw(bm, withdrawTx, bc.DEP_AMOUNT, bm.sa.dummy1, true);
        });
    });

    // This withdrawal will not be undone so it can be used further below
    describe("2nd withdraw, after some swaps and collectAndDistributeInterest()", async () => {

        let withdrawTx: any;

        beforeEach("creating snapshot", async () => {
            await bm.genInterest();
            withdrawTx = await bm.bomh.withdraw(bc.DEP_AMOUNT, { from: bm.sa.dummy1 });
        });
    
        it("Valid withdraw", async () => {
            await validWithdraw(bm, withdrawTx, bc.DEP_AMOUNT, bm.sa.dummy1, false);
        });
    });
});
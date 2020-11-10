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
        await bm.bomh.deposit(bm.tusd.address, bc.DEP_AMOUNT, { from: bm.sa.dummy1});
    });

    describe("--------BUG SHOWCASE - CHECK CODE--------", async () => {

        let withdrawTx: any;

        before(async () => {
            console.log(`
            -----------------NOTE-----------------
            There are 2 bugs I've discovered with 2 cases.
            Case 1: withdrawing straight after depositing
            Case 2: withdrawing after there have been some swaps
            by a 3rd party after depositing

            This branch focuses on bug 1

            Bug 1 is that getSaveRedeemInput() returns 1 more than
            it should in both cases, meaning that it has to
            be compensated for when using the returned value, otherwise
            trying to redeem the amount that getSaveRedeemInput() returns
            will throw an error saying bm.bomh doesn't own that many credits.
            This error can be seen in the console.log() for both cases
            below.

            ---Without any swapping before---
            getSaveRedeemInput() = 
            ${await bm.mstHelp.getSaveRedeemInput(bm.mUSDSAVE.address, bc.LENT_AMOUNT)}
            
            If no measures are taken to compensate for this, then withdrawing
            the same amount that was deposited, as in this test, will fail
            with 'Saver has no credits'.
            The credit balance of bomh:
            ${await bm.mUSDSAVE.creditBalances(bm.bomh.address)}

            `);

            withdrawTx = await bm.bomh.withdraw(bc.DEP_AMOUNT, { from: bm.sa.dummy1 });
        });

        it("Valid withdraw", async () => {
            await validWithdraw(bm, withdrawTx, bc.DEP_AMOUNT, bm.sa.dummy1, true);
        });
    });
});
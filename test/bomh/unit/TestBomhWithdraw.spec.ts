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

    
    describe("--------BUG SHOWCASE - CHECK CODE--------", async () => {
        it("Case 1", async () => {
            console.log(`
            -----------------NOTE-----------------
            There are 2 bugs I've discovered with 2 cases.
            Case 1: withdrawing straight after depositing
            Case 2: withdrawing after there have been some swaps
            by a 3rd party after depositing

            This branch focuses on bug 2

            To compensate for bug 1, perhaps we should subtract 1 from the
            value returned by getSaveRedeemInput(). This branch has done
            that in bomh.sol

            ---Without any swapping before---
            getSaveRedeemInput() = 
            ${await bm.mstHelp.getSaveRedeemInput(bm.mUSDSAVE.address, bc.LENT_AMOUNT)}
            
            If no measures are taken to compensate for this, then withdrawing
            the same amount that was deposited, as in this test, will fail
            with 'Saver has no credits'.
            The credit balance of bomh:
            ${await bm.mUSDSAVE.creditBalances(bm.bomh.address)}

            `);

            await bm.bomh.withdraw(bc.DEP_AMOUNT, { from: bm.sa.dummy1 });
        });
    });
});
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

    describe("--------BUG 2 CASE 1 SHOWCASE - CHECK CODE--------", async () => {

        let withdrawTx: any;

        before(async () => {
            console.log(`
            -----------------NOTE-----------------
            There are 2 bugs I've discovered with 2 cases.
            Case 1: withdrawing straight after depositing
            Case 2: withdrawing after there have been some swaps
            by a 3rd party after depositing
    
            To compensate for bug 1, perhaps we should subtract 1 from the
            value returned by getSaveRedeemInput(). This branch has done
            that in bomh.sol. This allows withdraw() to execute without
            error, but means that users receive 1wei less than they should.
    
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
    
        it("Valid withdraw1", async () => {
            expect(await bm.tusd.balanceOf(bm.bomh.address)).bignumber.eq(ZERO);
        });

        it("Valid withdraw2", async () => {
            const feePaid = bc.LENT_AMOUNT.mul(bm.swapFee).div(fullScale);
            expect(await bm.tusd.balanceOf(bm.sa.dummy1)).bignumber.eq(bc.SC_INIT_AMOUNT.sub(feePaid));
        });

        it("Valid withdraw3", async () => {
            expect(await bm.mstHelp.getSaveBalance(bm.mUSDSAVE.address, bm.bomh.address))
                .bignumber.eq(ZERO);
        });

        it("Valid withdraw4", async () => {
            expect(await bm.mhUSD.balanceOf(bm.sa.dummy1)).bignumber.eq(ZERO);
        });

        it("Valid withdraw5", async () => {
            expect(await bm.mhUSD.totalSupply()).bignumber.eq(ZERO);
        });

        it("Valid withdraw6", async () => {
            await expectEvent(withdrawTx.receipt, "Withdrawn", {
                withdrawer: bm.sa.dummy1,
                bassetQuantity: bc.DEP_AMOUNT,
            });
        });
    });
});
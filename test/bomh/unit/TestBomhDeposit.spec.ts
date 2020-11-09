import { expectEvent, time, expectRevert } from "@openzeppelin/test-helpers";
import { fullScale, ZERO_ADDRESS } from "@utils/constants";
import * as bc from "@utils/bomhConstants";

import { expect } from "chai";
import { BN } from "@utils/tools";
import { BoMHMachine } from "@utils/machines";
import { bm, validDeposit, noAddedBassets } from "../shared/bomhShared";
import { createSnapshot, revertToSnapshot } from "../../helpers/blockchain";


contract("Bank of Moral Hazard Deposits", async (accounts) => {
    
    let snapshot: any;

    before(async () => {
        if (!bm.initiated) {
            console.log("Initiating BoMH");
            await bm.init(accounts);
        }
    });

    beforeEach("creating snapshot", async () => {
        snapshot = await createSnapshot();
    });

    afterEach("reverting to snapshot", async () => {
        await revertToSnapshot(snapshot);
    });

    describe("Revert invalid deposits", async () => {
        it("Zero address", async () => {
            await expectRevert(
                bm.bomh.deposit(ZERO_ADDRESS, bc.SC_INIT_AMOUNT, { from: bm.sa.dummy1 }),
                "Need a token address",
            );
        });
    
        it("Zero bassetQuantity", async () => {
            await expectRevert(
                bm.bomh.deposit(bm.tusd.address, 0, { from: bm.sa.dummy1 }),
                "Get your peasant ass out of here",
            );
        });
    
        it("Token that's been removed", async () => {
            // Remove bm.tusd from the basket
            await bm.mUSD.redeem(bm.tusd.address, (await bm.mUSD.balanceOf(bm.sa.default)).div(new BN(4)), { from: bm.sa.default });
            await bm.mUSDBaskMan.setBasketWeights([bm.tusd.address], [0], { from: bm.sa.governor });
            await bm.mUSDBaskMan.removeBasset(bm.tusd.address, { from: bm.sa.governor });

            // Deposit attempt
            await expectRevert(
                bm.bomh.deposit(bm.tusd.address, fullScale, { from: bm.sa.dummy1 }),
                "bAsset does not exist",
            );
        });
    });

    describe("Deposit", async () => {

        let depositTx: any;
        
        // Snapshot revert not necessarily needed here, but
        // good practice
        beforeEach(async () => {
            depositTx = await bm.bomh.deposit(bm.tusd.address, bc.DEP_AMOUNT, { from: bm.sa.dummy1});
        });

        it("Valid deposit", async () => {
            await validDeposit(bm, depositTx);
        });

        it("No added bassets", async () => {
            await noAddedBassets(bm);
        });
    });
});
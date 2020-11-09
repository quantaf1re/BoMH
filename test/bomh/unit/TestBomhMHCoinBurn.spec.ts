import { expectEvent, time, expectRevert } from "@openzeppelin/test-helpers";
import { fullScale, ZERO, ONE_DAY, TEN_DAYS, ZERO_ADDRESS, DEAD_ADDRESS } from "@utils/constants";
import * as bc from "@utils/bomhConstants";

import { expect } from "chai";
import { BN } from "@utils/tools";
import { bm, validMHCoinBurn } from "../shared/bomhShared";
import { createSnapshot, revertToSnapshot } from "../../helpers/blockchain";


contract("Bank of Moral Hazard mhCoinBurn", async (accounts) => {

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

    describe("Before cashOut", async () => {
        beforeEach("creating snapshot", async () => {
            await bm.cumulWithdraw();
        });

        it("Revert mhCoinBurn no credits", async () => {
            await expectRevert(
                bm.bomh.mhCoinBurn({ from: bm.sa.dummy1 }),
                "Need to burn non-zero amount",
            );
        });
    });

    describe("After cashOut", async () => {
        
        const bidAmount = fullScale.mul(new BN(100));

        beforeEach("creating snapshot", async () => {
            await bm.cumulMHCoinBurn(bidAmount);
        });
    
        it("Valid mhCoinBurn", async () => {
            await validMHCoinBurn(bm, bidAmount);
        });
    });
});
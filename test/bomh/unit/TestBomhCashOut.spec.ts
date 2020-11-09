import { expectEvent, time, expectRevert } from "@openzeppelin/test-helpers";
import { fullScale, ZERO, ONE_DAY, TEN_DAYS, ZERO_ADDRESS, DEAD_ADDRESS } from "@utils/constants";
import * as bc from "@utils/bomhConstants";

import { expect } from "chai";
import { BN } from "@utils/tools";
import { BoMHMachine } from "@utils/machines";
import { bm, validCashOut } from "../shared/bomhShared";
import { createSnapshot, revertToSnapshot } from "../../helpers/blockchain";


const Auction = artifacts.require("Auction");


contract("Bank of Moral Hazard cashOut", async (accounts) => {

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

    describe("Before generated interest", async () => {
        beforeEach("creating snapshot", async () => {
            await bm.bomh.deposit(bm.tusd.address, bc.DEP_AMOUNT, { from: bm.sa.dummy1});
            await bm.bomh.withdraw(bc.DEP_AMOUNT, { from: bm.sa.dummy1 });
        });
    
        it("Revert cashOut no credits", async () => {
            await expectRevert(
                bm.bomh.cashOut({ from: bm.sa.dummy1 }),
                "Saver has no credits",
            );
        });
    });

    describe("After generated interest", async () => {
        
        let cashOutTx: any;

        beforeEach("creating snapshot", async () => {
            cashOutTx = await bm.cumulCashOut();
        });

        it("Valid cashOut", async () => {
            const auction = await Auction.at(await bm.bomh.indexToAuctionAddr(0));
            await validCashOut(bm, auction, cashOutTx);
        });
    });
});
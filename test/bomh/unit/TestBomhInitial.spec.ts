import { expectEvent, time, expectRevert } from "@openzeppelin/test-helpers";
import { fullScale, ZERO_ADDRESS } from "@utils/constants";
import * as bc from "@utils/bomhConstants";

import { expect } from "chai";
import { bm, validInitState } from "../shared/bomhShared";
import { createSnapshot, revertToSnapshot } from "../../helpers/blockchain";


const MockERC20 = artifacts.require("MockERC20");


contract("Bank of Moral Hazard initial state", async (accounts) => {

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

    it("Verifying default storage", async () => {
        await validInitState(bm);
    });

    it("getReserveTokens valid", async () => {
        const [baskBassets, ] = await bm.mUSDBaskMan.getBassets();
        const resTokens = await bm.bomh.getReserveTokens();
        for (let i in baskBassets) {
            expect(baskBassets[i].addr).eq(resTokens[i]);
        };
    });
});